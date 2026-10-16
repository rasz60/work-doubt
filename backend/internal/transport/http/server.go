package http

import (
	"net/http"

	"github.com/devsixt/workout/backend/internal/config"
	"github.com/devsixt/workout/backend/internal/platform/auth"
	"github.com/devsixt/workout/backend/internal/usecase"
)

// Deps 는 라우터가 필요로 하는 유스케이스 묶음이다.
type Deps struct {
	Config   *config.Config
	Verifier *auth.Verifier
	Account  *usecase.Account
	Metric   *usecase.Metric
	Group    *usecase.Group
	Coach    *usecase.Coach
}

// NewRouter 는 Go 1.22 ServeMux 패턴 라우팅으로 전체 API 를 구성한다.
func NewRouter(d Deps) http.Handler {
	accountHandler := NewAccountHandler(d.Account)
	metricHandler := NewMetricHandler(d.Metric)
	groupHandler := NewGroupHandler(d.Group)
	coachHandler := NewCoachHandler(d.Coach)

	mux := http.NewServeMux()

	// 인증 불필요
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	// 로그인·가입·로그아웃은 ae:p 포털(Supabase Auth)이 한다. 이 API 는 전부 인증 필요
	protected := func(pattern string, handler http.HandlerFunc) {
		mux.HandleFunc(pattern, requireAuth(d.Verifier, d.Account, handler))
	}

	protected("GET /api/v1/me", accountHandler.Me)
	protected("PATCH /api/v1/me", accountHandler.UpdateProfile)

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
