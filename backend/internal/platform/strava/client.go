// Package strava 는 domain.ActivityProvider 의 Strava 구현이다.
// Strava 앱(https://www.strava.com/settings/api)의 Client ID · Secret 과, 그 앱의 Authorization Callback Domain 에
// 이 서버 도메인을 등록해야 한다.
package strava

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
)

const (
	defaultOAuthBase = "https://www.strava.com/oauth"
	defaultAPIBase   = "https://www.strava.com/api/v3"
	perPage          = 200 // Strava 가 허용하는 최대
	maxPages         = 20  // 한 번에 최대 4000개. Strava 읽기 한도(15분 100회)를 넘지 않는다
)

type Client struct {
	clientID     string
	clientSecret string
	redirectURL  string
	http         *http.Client
	oauthBase    string
	apiBase      string
}

func New(clientID, clientSecret, redirectURL string) *Client {
	return &Client{
		clientID:     clientID,
		clientSecret: clientSecret,
		redirectURL:  redirectURL,
		http:         &http.Client{Timeout: 15 * time.Second},
		oauthBase:    defaultOAuthBase,
		apiBase:      defaultAPIBase,
	}
}

var _ domain.ActivityProvider = (*Client)(nil)

func (c *Client) AuthURL(state string) string {
	q := url.Values{
		"client_id":       {c.clientID},
		"redirect_uri":    {c.redirectURL},
		"response_type":   {"code"},
		"approval_prompt": {"auto"},
		"scope":           {"activity:read_all"},
		"state":           {state},
	}
	return c.oauthBase + "/authorize?" + q.Encode()
}

type tokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresAt    int64  `json:"expires_at"`
	Athlete      *struct {
		ID        int64  `json:"id"`
		Username  string `json:"username"`
		FirstName string `json:"firstname"`
		LastName  string `json:"lastname"`
	} `json:"athlete"`
}

func (c *Client) Exchange(ctx context.Context, code string) (*domain.OAuthToken, error) {
	return c.token(ctx, "exchange", url.Values{"code": {code}, "grant_type": {"authorization_code"}})
}

func (c *Client) Refresh(ctx context.Context, refreshToken string) (*domain.OAuthToken, error) {
	return c.token(ctx, "refresh", url.Values{"refresh_token": {refreshToken}, "grant_type": {"refresh_token"}})
}

func (c *Client) token(ctx context.Context, op string, form url.Values) (*domain.OAuthToken, error) {
	form.Set("client_id", c.clientID)
	form.Set("client_secret", c.clientSecret)

	var body tokenResponse
	if err := c.do(ctx, op, http.MethodPost, c.oauthBase+"/token", "", form, &body); err != nil {
		return nil, err
	}
	if body.AccessToken == "" {
		return nil, fmt.Errorf("strava %s: empty access token", op)
	}

	token := &domain.OAuthToken{
		AccessToken:  body.AccessToken,
		RefreshToken: body.RefreshToken,
		ExpiresAt:    time.Unix(body.ExpiresAt, 0),
	}
	if a := body.Athlete; a != nil {
		token.AccountID = strconv.FormatInt(a.ID, 10)
		token.AccountName = strings.TrimSpace(a.FirstName + " " + a.LastName)
		if token.AccountName == "" {
			token.AccountName = a.Username
		}
	}
	return token, nil
}

func (c *Client) Revoke(ctx context.Context, accessToken string) error {
	return c.do(ctx, "revoke", http.MethodPost, c.oauthBase+"/deauthorize", "", url.Values{"access_token": {accessToken}}, nil)
}

type activity struct {
	ID               int64   `json:"id"`
	Name             string  `json:"name"`
	SportType        string  `json:"sport_type"`
	Type             string  `json:"type"`
	StartDateLocal   string  `json:"start_date_local"` // 활동한 곳의 현지 시각인데 끝에 Z 가 붙어 온다
	Distance         float64 `json:"distance"`         // m
	MovingTime       int     `json:"moving_time"`      // 초
	ElapsedTime      int     `json:"elapsed_time"`
	AverageHeartrate float64 `json:"average_heartrate"`
	Calories         float64 `json:"calories"` // 목록 응답에는 보통 없다
}

func (c *Client) Activities(ctx context.Context, accessToken string, after, before time.Time) ([]domain.ExternalActivity, error) {
	out := make([]domain.ExternalActivity, 0, perPage)
	for page := 1; page <= maxPages; page++ {
		q := url.Values{
			"after":    {strconv.FormatInt(max(after.Unix(), 0), 10)},
			"per_page": {strconv.Itoa(perPage)},
			"page":     {strconv.Itoa(page)},
		}
		if !before.IsZero() {
			q.Set("before", strconv.FormatInt(before.Unix(), 10))
		}
		var batch []activity
		if err := c.do(ctx, "activities", http.MethodGet, c.apiBase+"/athlete/activities?"+q.Encode(), accessToken, nil, &batch); err != nil {
			return nil, err
		}
		for _, a := range batch {
			if act, ok := toExternal(a); ok {
				out = append(out, act)
			}
		}
		if len(batch) < perPage {
			break
		}
	}
	return out, nil
}

func toExternal(a activity) (domain.ExternalActivity, bool) {
	if len(a.StartDateLocal) < 10 || a.ID == 0 {
		return domain.ExternalActivity{}, false
	}
	act := domain.ExternalActivity{
		ExternalID:  strconv.FormatInt(a.ID, 10),
		Title:       a.Name,
		Kind:        kindOf(a),
		PerformedOn: a.StartDateLocal[:10],
	}
	if a.Distance > 0 {
		km := math.Round(a.Distance/10) / 100
		if km > 0 {
			act.DistanceKm = &km
		}
	}
	seconds := a.MovingTime
	if seconds <= 0 {
		seconds = a.ElapsedTime
	}
	if seconds > 0 {
		act.DurationSec = &seconds
	}
	if a.AverageHeartrate > 0 {
		hr := int(math.Round(a.AverageHeartrate))
		act.AvgHeartRate = &hr
	}
	if a.Calories > 0 {
		kcal := int(math.Round(a.Calories))
		act.CaloriesKcal = &kcal
	}
	return act, true
}

func kindOf(a activity) domain.WorkoutKind {
	sport := a.SportType
	if sport == "" {
		sport = a.Type
	}
	switch sport {
	case "Run", "TrailRun", "VirtualRun":
		return domain.KindRun
	case "WeightTraining", "Crossfit":
		return domain.KindWeight
	default:
		return domain.KindOther
	}
}

// do 는 요청을 보내고 JSON 응답을 dst 에 담는다. 401 은 ErrUnauthorized(토큰 만료 · 권한 회수)로 알린다.
func (c *Client) do(ctx context.Context, op, method, endpoint, accessToken string, form url.Values, dst any) error {
	var body io.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, body)
	if err != nil {
		return fmt.Errorf("strava %s: %w", op, err)
	}
	if form != nil {
		req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if accessToken != "" {
		req.Header.Set("Authorization", "Bearer "+accessToken)
	}
	req.Header.Set("Accept", "application/json")

	res, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("strava %s: %w", op, err)
	}
	defer res.Body.Close()

	if res.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("strava %s: HTTP 401: %w", op, domain.ErrUnauthorized)
	}
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		snippet, _ := io.ReadAll(io.LimitReader(res.Body, 300))
		return fmt.Errorf("strava %s: HTTP %d: %s", op, res.StatusCode, strings.TrimSpace(string(snippet)))
	}
	if dst == nil {
		return nil
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 10<<20)).Decode(dst); err != nil {
		return fmt.Errorf("strava %s: decode: %w", op, err)
	}
	return nil
}
