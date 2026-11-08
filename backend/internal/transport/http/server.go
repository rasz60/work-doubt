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
	Plan     *usecase.Plan
	Session  *usecase.Session
	Activity *usecase.Activity
	Sync     *usecase.Sync
	Tester   *usecase.Tester
}

// NewRouter 는 Go 1.22 ServeMux 패턴 라우팅으로 전체 API 를 구성한다.
func NewRouter(d Deps) http.Handler {
	accountHandler := NewAccountHandler(d.Account)
	metricHandler := NewMetricHandler(d.Metric)
	groupHandler := NewGroupHandler(d.Group)
	coachHandler := NewCoachHandler(d.Coach)
	activityHandler := NewActivityHandler(d.Plan, d.Session, d.Activity)
	syncHandler := NewSyncHandler(d.Sync)
	testerHandler := NewTesterHandler(d.Tester)

	mux := http.NewServeMux()

	// 인증 불필요
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})

	// 로그인·가입·로그아웃은 ae:p 포털(Supabase Auth)이 한다. 아래 API 는 전부 인증 필요
	protected := func(pattern string, handler http.HandlerFunc) {
		mux.HandleFunc(pattern, requireAuth(d.Verifier, d.Account, handler))
	}
	// 테스터 계정(P-0004)에게 막은 기능: AI 코치, 그룹 만들기 · 참여, Apple 건강 연동
	blocked := func(pattern string, handler http.HandlerFunc) {
		protected(pattern, blockTester(d.Tester, handler))
	}

	protected("GET /api/v1/me", accountHandler.Me)
	protected("PATCH /api/v1/me", accountHandler.UpdateProfile)

	protected("POST /api/v1/metrics", metricHandler.Record)
	protected("GET /api/v1/metrics", metricHandler.History)
	protected("GET /api/v1/metrics/latest", metricHandler.Latest)
	protected("GET /api/v1/metrics/series", metricHandler.Series)
	protected("DELETE /api/v1/metrics/{id}", metricHandler.Delete)

	blocked("POST /api/v1/groups", groupHandler.Create)
	protected("GET /api/v1/groups", groupHandler.List)
	blocked("POST /api/v1/groups/join", groupHandler.Join)
	protected("GET /api/v1/groups/{id}/members", groupHandler.Members)
	protected("DELETE /api/v1/groups/{id}/members/me", groupHandler.Leave)

	blocked("POST /api/v1/coach/conversations", coachHandler.StartConversation)
	blocked("GET /api/v1/coach/conversations", coachHandler.ListConversations)
	blocked("GET /api/v1/coach/conversations/{id}/messages", coachHandler.Messages)
	blocked("POST /api/v1/coach/conversations/{id}/ask", coachHandler.Ask)

	protected("GET /api/v1/plans", activityHandler.ListPlans)
	protected("POST /api/v1/plans", activityHandler.SavePlan)
	protected("DELETE /api/v1/plans/{id}", activityHandler.DeletePlan)

	protected("GET /api/v1/sessions", activityHandler.ListSessions)
	protected("POST /api/v1/sessions", activityHandler.CreateSession)
	protected("PUT /api/v1/sessions/{id}", activityHandler.UpdateSession)
	protected("DELETE /api/v1/sessions/{id}", activityHandler.DeleteSession)

	protected("GET /api/v1/activity/calendar", activityHandler.Calendar)
	protected("GET /api/v1/activity/summary", activityHandler.Summary)

	protected("GET /api/v1/sync", syncHandler.Overview)
	blocked("POST /api/v1/sync/apple-health", syncHandler.AppleHealth)
	protected("DELETE /api/v1/sync/connections/{id}", syncHandler.Disconnect)

	// 포털이 테스터 로그아웃 직전에 부른다. 테스터가 아니면 아무것도 지우지 않는다
	protected("POST /api/v1/tester/reset", testerHandler.Reset)

	return withLogging(withCORS(d.Config.AllowOrigin, mux))
}
