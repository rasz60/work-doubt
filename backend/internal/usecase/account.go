package usecase

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/devsixt/workout/backend/internal/domain"
)

// Account 는 로그인한 사용자의 프로필을 다룬다. 로그인 자체는 ae:p 포털(Supabase Auth)이 한다.
type Account struct {
	users domain.UserRepository
	known sync.Map // 이 프로세스에서 프로필을 이미 확인한 사용자 id
}

func NewAccount(users domain.UserRepository) *Account {
	return &Account{users: users}
}

// Ensure 는 처음 들어온 사용자의 프로필을 만든다. 요청마다 DB 를 부르지 않도록 한 번 확인한 id 는 기억한다.
func (a *Account) Ensure(ctx context.Context, userID, email string) error {
	if _, ok := a.known.Load(userID); ok {
		return nil
	}
	name := strings.SplitN(email, "@", 2)[0]
	if name == "" {
		name = "user"
	}
	if err := a.users.Ensure(ctx, userID, strings.ToLower(email), name); err != nil {
		return err
	}
	a.known.Store(userID, struct{}{})
	return nil
}

func (a *Account) Me(ctx context.Context, userID string) (*domain.User, error) {
	return a.users.FindByID(ctx, userID)
}

// UpdateProfile 은 프로필(표시 이름, 아바타, 기준 키) 을 갱신한다.
func (a *Account) UpdateProfile(ctx context.Context, userID, displayName, avatarURL string, heightCm *float64) (*domain.User, error) {
	user, err := a.users.FindByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	if displayName != "" {
		user.DisplayName = displayName
	}
	if avatarURL != "" {
		user.AvatarURL = avatarURL
	}
	if heightCm != nil {
		if *heightCm <= 0 || *heightCm > 300 {
			return nil, fmt.Errorf("update profile: height out of range: %w", domain.ErrInvalidInput)
		}
		user.HeightCm = heightCm
	}
	if err := a.users.Update(ctx, user); err != nil {
		return nil, err
	}
	return user, nil
}
