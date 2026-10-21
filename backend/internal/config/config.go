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

	// PublicURL 은 사용자가 여는 도메인이다 (https://ae2p.duckdns.org). 앱은 /workout, API 는 /api/workout 아래에 있다.
	// 기기 연동 주소 · Strava 가 돌려보낼 주소를 여기서 만든다.
	PublicURL string
	// Timezone 은 "오늘"을 정하는 시간대다 (잔디 · 칼로리). 기본 Asia/Seoul
	Timezone string

	// Strava 앱 키 (https://www.strava.com/settings/api). 비워 두면 Strava 연동을 숨긴다.
	StravaClientID     string
	StravaClientSecret string
}

// AppURL 은 웹 앱 주소다 (끝 / 없음).
func (c *Config) AppURL() string { return c.PublicURL + "/workout" }

// apiURL 은 브라우저 · 기기에서 본 이 API 의 주소다 (Caddy 가 /api/workout 을 떼고 넘긴다).
func (c *Config) apiURL() string { return c.PublicURL + "/api/workout" }

// IngestURL 은 기기 자동화가 운동 기록을 보내는 주소다.
func (c *Config) IngestURL() string { return c.apiURL() + "/api/v1/sync/ingest" }

// StravaRedirectURL 은 Strava 동의 뒤 돌아오는 주소다. Strava 앱의 Authorization Callback Domain 에 이 도메인을 넣는다.
func (c *Config) StravaRedirectURL() string { return c.apiURL() + "/api/v1/sync/strava/callback" }

// StravaEnabled 는 Strava 앱 키가 둘 다 있는지다.
func (c *Config) StravaEnabled() bool { return c.StravaClientID != "" && c.StravaClientSecret != "" }

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
		PublicURL:       strings.TrimRight(env("PUBLIC_URL", "https://ae2p.duckdns.org"), "/"),
		Timezone:        env("TIMEZONE", "Asia/Seoul"),

		StravaClientID:     strings.TrimSpace(os.Getenv("STRAVA_CLIENT_ID")),
		StravaClientSecret: strings.TrimSpace(os.Getenv("STRAVA_CLIENT_SECRET")),
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
