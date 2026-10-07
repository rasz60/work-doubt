package usecase

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/devsixt/workout/backend/internal/platform/auth"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// OAuthResolver 는 소셜 공급자 조회 포트다.
type OAuthResolver interface {
	Resolve(ctx context.Context, provider domain.Provider, code, redirectURL string) (domain.Identity, error)
}

type Auth struct {
	users    domain.UserRepository
	tokens   domain.RefreshTokenRepository
	issuer   *auth.Issuer
	resolver OAuthResolver
}

func NewAuth(users domain.UserRepository, tokens domain.RefreshTokenRepository, issuer *auth.Issuer, resolver OAuthResolver) *Auth {
	return &Auth{users: users, tokens: tokens, issuer: issuer, resolver: resolver}
}

type Session struct {
	User   *domain.User   `json:"user"`
	Tokens auth.TokenPair `json:"tokens"`
}

// Register 는 이메일/비밀번호 계정을 만든다.
func (a *Auth) Register(ctx context.Context, email, password, displayName string) (*Session, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || !strings.Contains(email, "@") {
		return nil, fmt.Errorf("register: email is invalid: %w", domain.ErrInvalidInput)
	}
	if len(password) < 8 {
		return nil, fmt.Errorf("register: password must be at least 8 characters: %w", domain.ErrInvalidInput)
	}
	if displayName == "" {
		displayName = strings.SplitN(email, "@", 2)[0]
	}

	if _, err := a.users.FindByEmail(ctx, email); err == nil {
		return nil, fmt.Errorf("register: email %q taken: %w", email, domain.ErrConflict)
	} else if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, fmt.Errorf("register: hash password: %w", err)
	}

	user := &domain.User{
		ID:           uuid.NewString(),
		Email:        email,
		DisplayName:  displayName,
		PasswordHash: string(hash),
	}
	if err := a.users.Create(ctx, user); err != nil {
		return nil, err
	}
	if err := a.users.LinkIdentity(ctx, user.ID, domain.Identity{
		Provider:       domain.ProviderLocal,
		ProviderUserID: email,
		Email:          email,
	}); err != nil {
		return nil, err
	}
	return a.startSession(ctx, user)
}

// Login 은 이메일/비밀번호 로그인이다.
func (a *Auth) Login(ctx context.Context, email, password string) (*Session, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	user, err := a.users.FindByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			// 계정 존재 여부를 노출하지 않는다.
			return nil, fmt.Errorf("login: credentials rejected: %w", domain.ErrUnauthorized)
		}
		return nil, err
	}
	if user.PasswordHash == "" {
		return nil, fmt.Errorf("login: account uses social sign-in: %w", domain.ErrUnauthorized)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, fmt.Errorf("login: credentials rejected: %w", domain.ErrUnauthorized)
	}
	return a.startSession(ctx, user)
}

// SocialLogin 은 구글/카카오/네이버 authorization code 로 로그인하거나 계정을 자동 생성한다.
func (a *Auth) SocialLogin(ctx context.Context, provider domain.Provider, code, redirectURL string) (*Session, error) {
	if !provider.Valid() || provider == domain.ProviderLocal {
		return nil, fmt.Errorf("social login: unsupported provider %q: %w", provider, domain.ErrInvalidInput)
	}
	if code == "" {
		return nil, fmt.Errorf("social login: code is required: %w", domain.ErrInvalidInput)
	}

	identity, err := a.resolver.Resolve(ctx, provider, code, redirectURL)
	if err != nil {
		return nil, err
	}

	user, err := a.users.FindByIdentity(ctx, provider, identity.ProviderUserID)
	switch {
	case err == nil:
		return a.startSession(ctx, user)
	case !errors.Is(err, domain.ErrNotFound):
		return nil, err
	}

	// 같은 이메일의 기존 계정이 있으면 소셜 identity 만 연결한다.
	if identity.Email != "" {
		existing, findErr := a.users.FindByEmail(ctx, strings.ToLower(identity.Email))
		if findErr == nil {
			if err := a.users.LinkIdentity(ctx, existing.ID, identity); err != nil {
				return nil, err
			}
			return a.startSession(ctx, existing)
		}
		if !errors.Is(findErr, domain.ErrNotFound) {
			return nil, findErr
		}
	}

	user = &domain.User{
		ID:          uuid.NewString(),
		Email:       strings.ToLower(identity.Email),
		DisplayName: identity.DisplayName,
		AvatarURL:   identity.AvatarURL,
	}
	if err := a.users.Create(ctx, user); err != nil {
		return nil, err
	}
	if err := a.users.LinkIdentity(ctx, user.ID, identity); err != nil {
		return nil, err
	}
	return a.startSession(ctx, user)
}

// Refresh 는 refresh token 을 1회용으로 교체한다(rotation).
func (a *Auth) Refresh(ctx context.Context, refreshToken string) (*Session, error) {
	hash := auth.HashToken(refreshToken)

	stored, err := a.tokens.FindValidByHash(ctx, hash)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("refresh: token rejected: %w", domain.ErrUnauthorized)
		}
		return nil, err
	}
	user, err := a.users.FindByID(ctx, stored.UserID)
	if err != nil {
		return nil, err
	}
	if err := a.tokens.Revoke(ctx, stored.ID); err != nil {
		return nil, err
	}
	return a.startSession(ctx, user)
}

// Logout 은 해당 사용자의 refresh token 전체를 폐기한다.
func (a *Auth) Logout(ctx context.Context, userID string) error {
	return a.tokens.RevokeAllByUser(ctx, userID)
}

func (a *Auth) Me(ctx context.Context, userID string) (*domain.User, error) {
	return a.users.FindByID(ctx, userID)
}

// UpdateProfile 은 프로필(표시 이름, 아바타, 기준 키) 을 갱신한다.
func (a *Auth) UpdateProfile(ctx context.Context, userID, displayName, avatarURL string, heightCm *float64) (*domain.User, error) {
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

func (a *Auth) startSession(ctx context.Context, user *domain.User) (*Session, error) {
	pair, err := a.issuer.Issue(user.ID)
	if err != nil {
		return nil, err
	}
	record := &domain.RefreshToken{
		ID:        uuid.NewString(),
		UserID:    user.ID,
		TokenHash: auth.HashToken(pair.RefreshToken),
		ExpiresAt: time.Now().Add(a.issuer.RefreshTTL()),
	}
	if err := a.tokens.Save(ctx, record); err != nil {
		return nil, err
	}
	return &Session{User: user, Tokens: pair}, nil
}
