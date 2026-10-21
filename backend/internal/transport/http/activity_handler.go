package http

import (
	"net/http"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/devsixt/workout/backend/internal/usecase"
)

// ActivityHandler 는 운동 계획 · 수행 기록 · 잔디 · 통계 API 다.
type ActivityHandler struct {
	plans    *usecase.Plan
	sessions *usecase.Session
	activity *usecase.Activity
}

func NewActivityHandler(plans *usecase.Plan, sessions *usecase.Session, activity *usecase.Activity) *ActivityHandler {
	return &ActivityHandler{plans: plans, sessions: sessions, activity: activity}
}

// ── 계획 ─────────────────────────────────────────────

type savePlanRequest struct {
	EffectiveFrom string           `json:"effective_from"`
	Title         string           `json:"title"`
	Days          []domain.PlanDay `json:"days"`
}

func (h *ActivityHandler) ListPlans(w http.ResponseWriter, r *http.Request) {
	plans, err := h.plans.List(r.Context(), userID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": plans})
}

func (h *ActivityHandler) SavePlan(w http.ResponseWriter, r *http.Request) {
	var req savePlanRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	plan, err := h.plans.Save(r.Context(), userID(r), usecase.SavePlanInput{
		EffectiveFrom: req.EffectiveFrom,
		Title:         req.Title,
		Days:          req.Days,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, plan)
}

func (h *ActivityHandler) DeletePlan(w http.ResponseWriter, r *http.Request) {
	if err := h.plans.Delete(r.Context(), userID(r), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// ── 수행 기록 ─────────────────────────────────────────────

type sessionRequest struct {
	PerformedOn  string              `json:"performed_on"`
	Kind         domain.WorkoutKind  `json:"kind"`
	Title        string              `json:"title"`
	DistanceKm   *float64            `json:"distance_km"`
	DurationSec  *int                `json:"duration_sec"`
	CaloriesKcal *int                `json:"calories_kcal"`
	AvgHeartRate *int                `json:"avg_heart_rate"`
	Memo         string              `json:"memo"`
	Sets         []domain.SessionSet `json:"sets"`
}

func (req sessionRequest) input() usecase.SessionInput {
	return usecase.SessionInput{
		PerformedOn:  req.PerformedOn,
		Kind:         req.Kind,
		Title:        req.Title,
		DistanceKm:   req.DistanceKm,
		DurationSec:  req.DurationSec,
		CaloriesKcal: req.CaloriesKcal,
		AvgHeartRate: req.AvgHeartRate,
		Memo:         req.Memo,
		Sets:         req.Sets,
	}
}

// ListSessions 는 GET /api/v1/sessions?from=&to= (비우면 최근 2주).
func (h *ActivityHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	sessions, err := h.sessions.List(r.Context(), userID(r), q.Get("from"), q.Get("to"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": sessions})
}

func (h *ActivityHandler) CreateSession(w http.ResponseWriter, r *http.Request) {
	var req sessionRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	session, err := h.sessions.Create(r.Context(), userID(r), req.input())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

func (h *ActivityHandler) UpdateSession(w http.ResponseWriter, r *http.Request) {
	var req sessionRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	session, err := h.sessions.Update(r.Context(), userID(r), r.PathValue("id"), req.input())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (h *ActivityHandler) DeleteSession(w http.ResponseWriter, r *http.Request) {
	if err := h.sessions.Delete(r.Context(), userID(r), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// ── 잔디 · 통계 ─────────────────────────────────────────────

// Calendar 는 GET /api/v1/activity/calendar?from=&to= (비우면 최근 4주).
func (h *ActivityHandler) Calendar(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	days, err := h.activity.Calendar(r.Context(), userID(r), q.Get("from"), q.Get("to"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": days})
}

// Summary 는 GET /api/v1/activity/summary?month=YYYY-MM (비우면 이번 달).
func (h *ActivityHandler) Summary(w http.ResponseWriter, r *http.Request) {
	summary, err := h.activity.Summary(r.Context(), userID(r), r.URL.Query().Get("month"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, summary)
}
