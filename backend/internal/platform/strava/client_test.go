package strava

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
)

func newTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	c := New("123", "shh", "https://ae2p.test/api/workout/api/v1/sync/strava/callback")
	c.oauthBase = server.URL + "/oauth"
	c.apiBase = server.URL + "/api/v3"
	return c
}

func TestAuthURL(t *testing.T) {
	u, err := url.Parse(New("123", "shh", "https://ae2p.test/cb").AuthURL("st"))
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	if u.Host != "www.strava.com" || q.Get("client_id") != "123" || q.Get("scope") != "activity:read_all" ||
		q.Get("redirect_uri") != "https://ae2p.test/cb" || q.Get("state") != "st" || q.Get("response_type") != "code" {
		t.Errorf("auth url = %s", u)
	}
}

func TestExchange(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/oauth/token" || r.Method != http.MethodPost {
			http.NotFound(w, r)
			return
		}
		_ = r.ParseForm()
		if r.Form.Get("client_secret") != "shh" || r.Form.Get("code") != "abc" || r.Form.Get("grant_type") != "authorization_code" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		fmt.Fprint(w, `{"access_token":"a","refresh_token":"r","expires_at":1793000000,"athlete":{"id":42,"firstname":"Jiho","lastname":"Kim"}}`)
	})

	token, err := c.Exchange(context.Background(), "abc")
	if err != nil {
		t.Fatal(err)
	}
	if token.AccessToken != "a" || token.RefreshToken != "r" || token.AccountID != "42" || token.AccountName != "Jiho Kim" ||
		!token.ExpiresAt.Equal(time.Unix(1793000000, 0)) {
		t.Errorf("token = %+v", token)
	}
}

func TestActivitiesPagesAndMaps(t *testing.T) {
	var pages []string
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer tok" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		pages = append(pages, r.URL.Query().Get("page"))
		if r.URL.Query().Get("after") != "1790000000" || r.URL.Query().Get("before") != "1795000000" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if r.URL.Query().Get("page") == "1" {
			// 한 페이지가 꽉 차면 다음 페이지를 부른다
			items := make([]string, perPage)
			for i := range items {
				items[i] = fmt.Sprintf(`{"id":%d,"name":"Run %d","sport_type":"Run","start_date_local":"2026-10-20T07:00:00Z","distance":5012.3,"moving_time":1500,"elapsed_time":1600,"average_heartrate":151.6}`, i+1, i+1)
			}
			fmt.Fprint(w, "["+strings.Join(items, ",")+"]")
			return
		}
		fmt.Fprint(w, `[{"id":9001,"name":"Gym","sport_type":"WeightTraining","start_date_local":"2026-10-21T19:30:00Z","distance":0,"moving_time":0,"elapsed_time":3000},
			{"id":9002,"name":"Ride","type":"Ride","start_date_local":"2026-10-21T08:00:00Z","distance":20000,"moving_time":3600}]`)
	})

	acts, err := c.Activities(context.Background(), "tok", time.Unix(1790000000, 0), time.Unix(1795000000, 0))
	if err != nil {
		t.Fatal(err)
	}
	if len(pages) != 2 || len(acts) != perPage+2 {
		t.Fatalf("pages %v, activities %d", pages, len(acts))
	}

	run := acts[0]
	if run.Kind != domain.KindRun || run.PerformedOn != "2026-10-20" || *run.DistanceKm != 5.01 || *run.DurationSec != 1500 || *run.AvgHeartRate != 152 {
		t.Errorf("run = %+v", run)
	}
	gym := acts[perPage]
	if gym.Kind != domain.KindWeight || gym.DistanceKm != nil || *gym.DurationSec != 3000 || gym.ExternalID != "9001" {
		t.Errorf("gym = %+v", gym)
	}
	if acts[perPage+1].Kind != domain.KindOther {
		t.Errorf("ride kind = %s", acts[perPage+1].Kind)
	}
}

func TestUnauthorized(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	})
	if _, err := c.Activities(context.Background(), "expired", time.Now(), time.Time{}); !errors.Is(err, domain.ErrUnauthorized) {
		t.Errorf("err = %v, want ErrUnauthorized", err)
	}
}
