package config

import (
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port        string
	DatabaseURL string
	AllowOrigin string

	// DBMaxConns 는 풀 크기, DBQueryMode 는 pgx 실행 방식이다.
	// Supabase Supavisor transaction 모드(포트 6543)에서는 prepared statement
	// 캐시를 끄는 "exec" 가 필요하다. 비워 두면 포트로 자동 판단한다.
	DBMaxConns  int32
	DBQueryMode string

	// SupabaseURL 은 로그인 토큰 검증에 쓴다 (https://<ref>.supabase.co). 공개키(JWKS)를 여기서 받는다.
	SupabaseURL string

	AnthropicAPIKey string
	ClaudeModel     string
}

// Load 는 환경변수에서 설정을 읽는다. 필수값이 없으면 에러를 반환한다.
func Load() (*Config, error) {
	cfg := &Config{
		Port:            env("PORT", "8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		AllowOrigin:     env("ALLOW_ORIGIN", "*"),
		DBMaxConns:      int32(envInt("DB_MAX_CONNS", 5)),
		DBQueryMode:     os.Getenv("DB_QUERY_MODE"),
		SupabaseURL:     strings.TrimRight(os.Getenv("SUPABASE_URL"), "/"),
		AnthropicAPIKey: os.Getenv("ANTHROPIC_API_KEY"),
		ClaudeModel:     env("CLAUDE_MODEL", "claude-opus-5"),
	}

	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("config: DATABASE_URL is required")
	}
	if !strings.HasPrefix(cfg.SupabaseURL, "https://") {
		return nil, fmt.Errorf("config: SUPABASE_URL is required (https://<ref>.supabase.co)")
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
