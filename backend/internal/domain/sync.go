package domain

import (
	"context"
	"time"
)

type SyncProvider string

// ProviderAppleHealth 는 iPhone 앱이 HealthKit 에서 읽어 보내는 연결이다. 사용자마다 하나
const ProviderAppleHealth SyncProvider = "apple_health"

// SyncConnection 은 "Apple 건강" 화면의 연결 한 줄이다.
type SyncConnection struct {
	ID                string       `json:"id"`
	UserID            string       `json:"user_id"`
	Provider          SyncProvider `json:"provider"`
	Name              string       `json:"name"`
	ExternalAccountID string       `json:"external_account_id,omitempty"`
	LastSyncedAt      *time.Time   `json:"last_synced_at,omitempty"`
	LastError         string       `json:"last_error,omitempty"`
	CreatedAt         time.Time    `json:"created_at"`
}

type SyncConnectionRepository interface {
	// Save 는 (user_id, provider, external_account_id) 로 넣거나 이름을 바꾼다. c.ID 는 실제 행 id 로 채운다.
	Save(ctx context.Context, c *SyncConnection) error
	List(ctx context.Context, userID string) ([]SyncConnection, error)
	Find(ctx context.Context, userID, id string) (*SyncConnection, error)
	// MarkSynced 는 마지막 동기화 시각과 오류(없으면 빈 문자열)를 남긴다.
	MarkSynced(ctx context.Context, id string, at time.Time, syncErr string) error
	Delete(ctx context.Context, userID, id string) error
}

// ExternalActivity 는 연동으로 들어온 활동 하나다.
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
