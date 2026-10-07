package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
)

type OAuthClient struct {
	ClientID     string
	ClientSecret string
	RedirectURL  string
}

type Config struct {
	Port        string
	DatabaseURL string
	AllowOrigin string

	// DBMaxConns 는 풀 크기, DBQueryMode 는 pgx 실행 방식이다.
	// Supabase Supavisor transaction 모드(포트 6543)에서는 prepared statement
	// 캐시를 끄는 "exec" 가 필요하다. 비워 두면 포트로 자동 판단한다.
	DBMaxConns  int32
	DBQueryMode string

	JWTSecret  string
	AccessTTL  time.Duration
	RefreshTTL time.Duration

	AnthropicAPIKey string
	ClaudeModel     string

	Google OAuthClient
	Kakao  OAuthClient
	Naver  OAuthClient
}

// Load 는 환경변수에서 설정을 읽는다. 필수값이 없으면 에러를 반환한다.
func Load() (*Config, error) {
	cfg := &Config{
		Port:            env("PORT", "8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		AllowOrigin:     env("ALLOW_ORIGIN", "*"),
		DBMaxConns:      int32(envInt("DB_MAX_CONNS", 5)),
		DBQueryMode:     os.Getenv("DB_QUERY_MODE"),
		JWTSecret:       os.Getenv("JWT_SECRET"),
		AccessTTL:       envDuration("ACCESS_TOKEN_TTL", 30*time.Minute),
		RefreshTTL:      envDuration("REFRESH_TOKEN_TTL", 30*24*time.Hour),
		AnthropicAPIKey: os.Getenv("ANTHROPIC_API_KEY"),
		ClaudeModel:     env("CLAUDE_MODEL", "claude-opus-5"),
		Google: OAuthClient{
			ClientID:     os.Getenv("GOOGLE_CLIENT_ID"),
			ClientSecret: os.Getenv("GOOGLE_CLIENT_SECRET"),
			RedirectURL:  os.Getenv("GOOGLE_REDIRECT_URL"),
		},
		Kakao: OAuthClient{
			ClientID:     os.Getenv("KAKAO_CLIENT_ID"),
			ClientSecret: os.Getenv("KAKAO_CLIENT_SECRET"),
			RedirectURL:  os.Getenv("KAKAO_REDIRECT_URL"),
		},
		Naver: OAuthClient{
			ClientID:     os.Getenv("NAVER_CLIENT_ID"),
			ClientSecret: os.Getenv("NAVER_CLIENT_SECRET"),
			RedirectURL:  os.Getenv("NAVER_REDIRECT_URL"),
		},
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return nil, fmt.Errorf("config: JWT_SECRET must be at least 32 bytes")
	}

	// Supabase 직접 연결 호스트(db.<ref>.supabase.co)는 IPv6 전용이다.
	// IPv4 환경에서는 반드시 Supavisor 풀러(*.pooler.supabase.com)를 써야 한다.
	if strings.Contains(cfg.DatabaseURL, "db.") && strings.Contains(cfg.DatabaseURL, ".supabase.co") {
		slog.Warn("DATABASE_URL points at the Supabase direct host, which is IPv6-only",
			"hint", "use the Supavisor pooler host (*.pooler.supabase.com) if this network has no IPv6")
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if n, err := strconv.Atoi(os.Getenv(key)); err == nil && n > 0 {
		return n
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	if d, err := time.ParseDuration(v); err == nil {
		return d
	}
	// "3600" 처럼 초 단위 숫자도 허용한다.
	if n, err := strconv.Atoi(v); err == nil {
		return time.Duration(n) * time.Second
	}
	return fallback
}
