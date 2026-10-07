package domain

import (
	"context"
	"time"
)

// Provider 는 계정 인증 수단이다. local 은 이메일/비밀번호 가입.
type Provider string

const (
	ProviderLocal  Provider = "local"
	ProviderGoogle Provider = "google"
	ProviderKakao  Provider = "kakao"
	ProviderNaver  Provider = "naver"
)

func (p Provider) Valid() bool {
	switch p {
	case ProviderLocal, ProviderGoogle, ProviderKakao, ProviderNaver:
		return true
	default:
		return false
	}
}

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	DisplayName  string    `json:"display_name"`
	AvatarURL    string    `json:"avatar_url,omitempty"`
	HeightCm     *float64  `json:"height_cm,omitempty"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// Identity 는 소셜 공급자가 내려준 프로필 조각이다.
type Identity struct {
	Provider       Provider
	ProviderUserID string
	Email          string
	DisplayName    string
	AvatarURL      string
}

type RefreshToken struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	RevokedAt *time.Time
}

type UserRepository interface {
	Create(ctx context.Context, u *User) error
	Update(ctx context.Context, u *User) error
	FindByID(ctx context.Context, id string) (*User, error)
	FindByEmail(ctx context.Context, email string) (*User, error)
	FindByIdentity(ctx context.Context, provider Provider, providerUserID string) (*User, error)
	LinkIdentity(ctx context.Context, userID string, identity Identity) error
}

type RefreshTokenRepository interface {
	Save(ctx context.Context, t *RefreshToken) error
	FindValidByHash(ctx context.Context, hash string) (*RefreshToken, error)
	Revoke(ctx context.Context, id string) error
	RevokeAllByUser(ctx context.Context, userID string) error
}
