package domain

import (
	"context"
	"time"
)

type SyncProvider string

const (
	ProviderStrava SyncProvider = "strava"
	ProviderDevice SyncProvider = "device"
)

// SyncConnection 은 PROFILE 의 "연결된 기기" 한 줄이다. 토큰은 응답에 싣지 않는다.
type SyncConnection struct {
	ID                string       `json:"id"`
	UserID            string       `json:"user_id"`
	Provider          SyncProvider `json:"provider"`
	Name              string       `json:"name"`
	ExternalAccountID string       `json:"external_account_id,omitempty"`
	LastSyncedAt      *time.Time   `json:"last_synced_at,omitempty"`
	LastError         string       `json:"last_error,omitempty"`
	CreatedAt         time.Time    `json:"created_at"`

	AccessToken    string    `json:"-"`
	RefreshToken   string    `json:"-"`
	TokenExpiresAt time.Time `json:"-"`
}

type SyncConnectionRepository interface {
	// SaveOAuth 는 (user_id, provider, external_account_id) 로 넣거나 토큰 · 이름을 바꾼다. c.ID 는 실제 행 id 로 채운다.
	SaveOAuth(ctx context.Context, c *SyncConnection) error
	// CreateDevice 는 기기 토큰 연결을 만든다. 토큰 원문이 아니라 sha256 hex 를 받는다.
	CreateDevice(ctx context.Context, c *SyncConnection, tokenHash string) error
	List(ctx context.Context, userID string) ([]SyncConnection, error)
	Find(ctx context.Context, userID, id string) (*SyncConnection, error)
	FindByIngestHash(ctx context.Context, tokenHash string) (*SyncConnection, error)
	UpdateTokens(ctx context.Context, id, accessToken, refreshToken string, expiresAt time.Time) error
	// MarkSynced 는 마지막 동기화 시각과 오류(없으면 빈 문자열)를 남긴다.
	MarkSynced(ctx context.Context, id string, at time.Time, syncErr string) error
	Delete(ctx context.Context, userID, id string) error
}

// ExternalActivity 는 연동 서비스에서 가져온 활동 하나다.
type ExternalActivity struct {
	ExternalID   string
	Title        string
	Kind         WorkoutKind
	PerformedOn  string // YYYY-MM-DD (활동한 곳의 현지 날짜)
	DistanceKm   *float64
	DurationSec  *int
	CaloriesKcal *int
	AvgHeartRate *int
}

// OAuthToken 은 연동 서비스가 준 토큰과 계정 정보다.
type OAuthToken struct {
	AccessToken  string
	RefreshToken string
	ExpiresAt    time.Time
	AccountID    string
	AccountName  string
}

// ActivityProvider 는 서버가 활동을 가져오는 OAuth 연동 서비스의 포트다. 구현은 internal/platform 에 둔다.
type ActivityProvider interface {
	AuthURL(state string) string
	Exchange(ctx context.Context, code string) (*OAuthToken, error)
	Refresh(ctx context.Context, refreshToken string) (*OAuthToken, error)
	// Activities 는 after 이후 · before 이전에 시작한 활동을 준다. before 가 zero 면 끝 제한이 없다.
	Activities(ctx context.Context, accessToken string, after, before time.Time) ([]ExternalActivity, error)
	Revoke(ctx context.Context, accessToken string) error
}
