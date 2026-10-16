package domain

import (
	"context"
	"time"
)

// User 는 운동기록의 프로필이다. id 는 Supabase Auth 의 사용자 id(auth.users.id) 와 같다.
// 로그인·비밀번호·소셜 계정은 ae:p 포털(Supabase Auth)이 맡고, 여기에는 앱에서 쓰는 값만 둔다.
type User struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
	HeightCm    *float64  `json:"height_cm,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type UserRepository interface {
	// Ensure 는 처음 들어온 사용자의 프로필을 만든다. 이미 있으면 이메일만 맞춘다.
	Ensure(ctx context.Context, id, email, displayName string) error
	Update(ctx context.Context, u *User) error
	FindByID(ctx context.Context, id string) (*User, error)
}
