package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // 서버에 시간대 데이터가 없어도 TIMEZONE(Asia/Seoul)을 읽는다

	"github.com/devsixt/workout/backend/internal/config"
	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/devsixt/workout/backend/internal/platform/ai"
	"github.com/devsixt/workout/backend/internal/platform/auth"
	"github.com/devsixt/workout/backend/internal/platform/strava"
	"github.com/devsixt/workout/backend/internal/repository/postgres"
	transport "github.com/devsixt/workout/backend/internal/transport/http"
	"github.com/devsixt/workout/backend/internal/usecase"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	if err := run(); err != nil {
		slog.Error("server exited", "error", err)
		os.Exit(1)
	}
}

func run() error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := postgres.Connect(ctx, cfg.DatabaseURL, postgres.Options{
		MaxConns:  cfg.DBMaxConns,
		QueryMode: cfg.DBQueryMode,
	})
	if err != nil {
		return err
	}
	defer pool.Close()

	loc, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		return fmt.Errorf("config: TIMEZONE %q: %w", cfg.Timezone, err)
	}

	// 의존성 조립: repository → usecase → transport.
	var (
		users     = postgres.NewUserRepository(pool)
		metrics   = postgres.NewBodyMetricRepository(pool)
		groups    = postgres.NewGroupRepository(pool)
		coachRepo = postgres.NewCoachRepository(pool)
		plans     = postgres.NewPlanRepository(pool)
		sessions  = postgres.NewSessionRepository(pool)
		conns     = postgres.NewSyncConnectionRepository(pool)

		engine = ai.NewClaude(cfg.AnthropicAPIKey, cfg.ClaudeModel)
		clock  = usecase.NewClock(loc)
	)

	// Strava 는 앱 키가 있을 때만 켠다. state 서명 키는 client secret 이다 (서버만 안다)
	var stravaProvider domain.ActivityProvider
	if cfg.StravaEnabled() {
		stravaProvider = strava.New(cfg.StravaClientID, cfg.StravaClientSecret, cfg.StravaRedirectURL())
	}

	router := transport.NewRouter(transport.Deps{
		Config:   cfg,
		Verifier: auth.NewVerifier(cfg.SupabaseURL),
		Account:  usecase.NewAccount(users),
		Metric:   usecase.NewMetric(metrics, groups),
		Group:    usecase.NewGroup(groups),
		Coach:    usecase.NewCoach(coachRepo, users, metrics, engine),
		Plan:     usecase.NewPlan(plans),
		Session:  usecase.NewSession(sessions, clock),
		Activity: usecase.NewActivity(plans, sessions, metrics, clock),
		Sync:     usecase.NewSync(conns, sessions, stravaProvider, cfg.StravaClientSecret, clock),
	})

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           router,
		ReadHeaderTimeout: 10 * time.Second,
		// SSE 스트리밍이 있으므로 WriteTimeout 은 두지 않는다.
		IdleTimeout: 120 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		slog.Info("listening", "addr", server.Addr)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
			return
		}
		serverErr <- nil
	}()

	select {
	case err := <-serverErr:
		return err
	case <-ctx.Done():
		slog.Info("shutting down")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return server.Shutdown(shutdownCtx)
}
