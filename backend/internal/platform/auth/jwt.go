package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// TokenPair 는 클라이언트에 내려주는 토큰 묶음이다.
type TokenPair struct {
	AccessToken  string    `json:"access_token"`
	RefreshToken string    `json:"refresh_token"`
	ExpiresAt    time.Time `json:"expires_at"`
}

type Issuer struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewIssuer(secret string, accessTTL, refreshTTL time.Duration) *Issuer {
	return &Issuer{secret: []byte(secret), accessTTL: accessTTL, refreshTTL: refreshTTL}
}

func (i *Issuer) RefreshTTL() time.Duration { return i.refreshTTL }

// Issue 는 access token(JWT) 과 refresh token(랜덤 opaque) 을 함께 만든다.
func (i *Issuer) Issue(userID string) (TokenPair, error) {
	now := time.Now()
	exp := now.Add(i.accessTTL)

	claims := jwt.RegisteredClaims{
		Subject:   userID,
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(exp),
		Issuer:    "workout-api",
	}
	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(i.secret)
	if err != nil {
		return TokenPair{}, fmt.Errorf("auth: sign access token: %w", err)
	}

	raw, err := randomToken(32)
	if err != nil {
		return TokenPair{}, err
	}
	return TokenPair{AccessToken: signed, RefreshToken: raw, ExpiresAt: exp}, nil
}

// Verify 는 access token 에서 user id 를 꺼낸다.
func (i *Issuer) Verify(token string) (string, error) {
	parsed, err := jwt.ParseWithClaims(token, &jwt.RegisteredClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("auth: unexpected signing method %v", t.Header["alg"])
		}
		return i.secret, nil
	}, jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}))
	if err != nil {
		return "", fmt.Errorf("auth: parse token: %w", err)
	}

	claims, ok := parsed.Claims.(*jwt.RegisteredClaims)
	if !ok || claims.Subject == "" {
		return "", fmt.Errorf("auth: token has no subject")
	}
	return claims.Subject, nil
}

// HashToken 은 refresh token 을 DB 에 평문으로 두지 않기 위한 단방향 해시다.
func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func randomToken(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("auth: read random: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}
