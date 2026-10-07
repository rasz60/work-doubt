package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/devsixt/workout/backend/internal/config"
	"github.com/devsixt/workout/backend/internal/platform/ai"
	"github.com/devsixt/workout/backend/internal/platform/auth"
	"github.com/devsixt/workout/backend/internal/platform/oauth"
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

	// 의존성 조립: repository → usecase → transport.
	var (
		users     = postgres.NewUserRepository(pool)
		tokens    = postgres.NewRefreshTokenRepository(pool)
		metrics   = postgres.NewBodyMetricRepository(pool)
		groups    = postgres.NewGroupRepository(pool)
		coachRepo = postgres.NewCoachRepository(pool)

		issuer = auth.NewIssuer(cfg.JWTSecret, cfg.AccessTTL, cfg.RefreshTTL)
		engine = ai.NewClaude(cfg.AnthropicAPIKey, cfg.ClaudeModel)
	)

	router := transport.NewRouter(transport.Deps{
		Config: cfg,
		Issuer: issuer,
		Auth:   usecase.NewAuth(users, tokens, issuer, oauth.NewResolver(cfg)),
		Metric: usecase.NewMetric(metrics, groups),
		Group:  usecase.NewGroup(groups),
		Coach:  usecase.NewCoach(coachRepo, users, metrics, engine),
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
