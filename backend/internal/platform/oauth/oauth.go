package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/devsixt/workout/backend/internal/config"
	"github.com/devsixt/workout/backend/internal/domain"
)

// Resolver 는 (provider, authorization code) 를 도메인 Identity 로 바꿔준다.
type Resolver struct {
	clients map[domain.Provider]config.OAuthClient
	http    *http.Client
}

func NewResolver(cfg *config.Config) *Resolver {
	return &Resolver{
		clients: map[domain.Provider]config.OAuthClient{
			domain.ProviderGoogle: cfg.Google,
			domain.ProviderKakao:  cfg.Kakao,
			domain.ProviderNaver:  cfg.Naver,
		},
		http: &http.Client{Timeout: 10 * time.Second},
	}
}

type endpoints struct {
	token    string
	userInfo string
}

var providerEndpoints = map[domain.Provider]endpoints{
	domain.ProviderGoogle: {
		token:    "https://oauth2.googleapis.com/token",
		userInfo: "https://www.googleapis.com/oauth2/v3/userinfo",
	},
	domain.ProviderKakao: {
		token:    "https://kauth.kakao.com/oauth/token",
		userInfo: "https://kapi.kakao.com/v2/user/me",
	},
	domain.ProviderNaver: {
		token:    "https://nid.naver.com/oauth2.0/token",
		userInfo: "https://openapi.naver.com/v1/nid/me",
	},
}

// Resolve 는 code 를 access token 으로 교환한 뒤 프로필을 조회한다.
func (r *Resolver) Resolve(ctx context.Context, provider domain.Provider, code, redirectURL string) (domain.Identity, error) {
	client, ok := r.clients[provider]
	if !ok {
		return domain.Identity{}, fmt.Errorf("oauth: unsupported provider %q: %w", provider, domain.ErrInvalidInput)
	}
	ep := providerEndpoints[provider]
	if redirectURL == "" {
		redirectURL = client.RedirectURL
	}

	accessToken, err := r.exchange(ctx, ep.token, client, code, redirectURL)
	if err != nil {
		return domain.Identity{}, err
	}
	return r.profile(ctx, provider, ep.userInfo, accessToken)
}

func (r *Resolver) exchange(ctx context.Context, tokenURL string, client config.OAuthClient, code, redirectURL string) (string, error) {
	form := url.Values{
		"grant_type":    {"authorization_code"},
		"client_id":     {client.ClientID},
		"client_secret": {client.ClientSecret},
		"redirect_uri":  {redirectURL},
		"code":          {code},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", fmt.Errorf("oauth: build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded;charset=utf-8")

	res, err := r.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("oauth: token request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("oauth: token endpoint returned %d: %w", res.StatusCode, domain.ErrUnauthorized)
	}

	var body struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		return "", fmt.Errorf("oauth: decode token response: %w", err)
	}
	if body.AccessToken == "" {
		return "", fmt.Errorf("oauth: empty access token: %w", domain.ErrUnauthorized)
	}
	return body.AccessToken, nil
}

func (r *Resolver) profile(ctx context.Context, provider domain.Provider, userInfoURL, accessToken string) (domain.Identity, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, userInfoURL, nil)
	if err != nil {
		return domain.Identity{}, fmt.Errorf("oauth: build userinfo request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	res, err := r.http.Do(req)
	if err != nil {
		return domain.Identity{}, fmt.Errorf("oauth: userinfo request: %w", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		return domain.Identity{}, fmt.Errorf("oauth: userinfo returned %d: %w", res.StatusCode, domain.ErrUnauthorized)
	}

	// 공급자별 응답 스키마가 달라 한 구조체에 모아 디코드한 뒤 정규화한다.
	var raw struct {
		Sub     string `json:"sub"`     // google
		Email   string `json:"email"`   // google
		Name    string `json:"name"`    // google
		Picture string `json:"picture"` // google
		ID      any    `json:"id"`      // kakao
		Account struct {
			Email   string `json:"email"`
			Profile struct {
				Nickname string `json:"nickname"`
				ImageURL string `json:"profile_image_url"`
				ThumbURL string `json:"thumbnail_image_url"`
			} `json:"profile"`
		} `json:"kakao_account"` // kakao
		Response struct {
			ID           string `json:"id"`
			Email        string `json:"email"`
			Nickname     string `json:"nickname"`
			Name         string `json:"name"`
			ProfileImage string `json:"profile_image"`
		} `json:"response"` // naver
	}
	if err := json.NewDecoder(res.Body).Decode(&raw); err != nil {
		return domain.Identity{}, fmt.Errorf("oauth: decode userinfo: %w", err)
	}

	identity := domain.Identity{Provider: provider}
	switch provider {
	case domain.ProviderGoogle:
		identity.ProviderUserID = raw.Sub
		identity.Email = raw.Email
		identity.DisplayName = raw.Name
		identity.AvatarURL = raw.Picture
	case domain.ProviderKakao:
		identity.ProviderUserID = fmt.Sprintf("%v", raw.ID)
		identity.Email = raw.Account.Email
		identity.DisplayName = raw.Account.Profile.Nickname
		identity.AvatarURL = raw.Account.Profile.ImageURL
	case domain.ProviderNaver:
		identity.ProviderUserID = raw.Response.ID
		identity.Email = raw.Response.Email
		identity.DisplayName = firstNonEmpty(raw.Response.Nickname, raw.Response.Name)
		identity.AvatarURL = raw.Response.ProfileImage
	}

	if identity.ProviderUserID == "" {
		return domain.Identity{}, fmt.Errorf("oauth: provider returned no user id: %w", domain.ErrUnauthorized)
	}
	if identity.DisplayName == "" {
		identity.DisplayName = string(provider) + " user"
	}
	return identity, nil
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}
