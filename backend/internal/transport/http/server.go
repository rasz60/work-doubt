package http

import (
	"net/http"

	"github.com/devsixt/workout/backend/internal/config"
	"github.com/devsixt/workout/backend/internal/platform/auth"
	"github.com/devsixt/workout/backend/internal/usecase"
)

// Deps 는 라우터가 필요로 하는 유스케이스 묶음이다.
type Deps struct {
	Config *config.Config
	Issuer *auth.Issuer
	Auth   *usecase.Auth
	Metric *usecase.Metric
	Group  *usecase.Group
	Coach  *usecase.Coach
}

// NewRouter 는 Go 1.22 ServeMux 패턴 라우팅으로 전체 API 를 구성한다.
func NewRouter(d Deps) http.Handler {
	authHandler := NewAuthHandler(d.Auth)
	metricHandler := NewMetricHandler(d.Metric)
	groupHandler := NewGroupHandler(d.Group)
	coachHandler := NewCoachHandler(d.Coach)

	mux := http.NewServeMux()

	// 인증 불필요
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /api/v1/auth/register", authHandler.Register)
	mux.HandleFunc("POST /api/v1/auth/login", authHandler.Login)
	mux.HandleFunc("POST /api/v1/auth/social/{provider}", authHandler.SocialLogin)
	mux.HandleFunc("POST /api/v1/auth/refresh", authHandler.Refresh)

	// 인증 필요
	protected := func(pattern string, handler http.HandlerFunc) {
		mux.HandleFunc(pattern, requireAuth(d.Issuer, handler))
	}

	protected("POST /api/v1/auth/logout", authHandler.Logout)
	protected("GET /api/v1/me", authHandler.Me)
	protected("PATCH /api/v1/me", authHandler.UpdateProfile)

	protected("POST /api/v1/metrics", metricHandler.Record)
	protected("GET /api/v1/metrics", metricHandler.History)
	protected("GET /api/v1/metrics/latest", metricHandler.Latest)
	protected("GET /api/v1/metrics/series", metricHandler.Series)
	protected("DELETE /api/v1/metrics/{id}", metricHandler.Delete)

	protected("POST /api/v1/groups", groupHandler.Create)
	protected("GET /api/v1/groups", groupHandler.List)
	protected("POST /api/v1/groups/join", groupHandler.Join)
	protected("GET /api/v1/groups/{id}/members", groupHandler.Members)
	protected("DELETE /api/v1/groups/{id}/members/me", groupHandler.Leave)

	protected("POST /api/v1/coach/conversations", coachHandler.StartConversation)
	protected("GET /api/v1/coach/conversations", coachHandler.ListConversations)
	protected("GET /api/v1/coach/conversations/{id}/messages", coachHandler.Messages)
	protected("POST /api/v1/coach/conversations/{id}/ask", coachHandler.Ask)

	return withLogging(withCORS(d.Config.AllowOrigin, mux))
}
