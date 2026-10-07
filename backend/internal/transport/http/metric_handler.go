package http

import (
	"net/http"
	"strconv"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/devsixt/workout/backend/internal/usecase"
)

type MetricHandler struct {
	metrics *usecase.Metric
}

func NewMetricHandler(metrics *usecase.Metric) *MetricHandler {
	return &MetricHandler{metrics: metrics}
}

type recordMetricRequest struct {
	MeasuredAt       string   `json:"measured_at"` // YYYY-MM-DD, 비우면 오늘
	HeightCm         *float64 `json:"height_cm"`
	WeightKg         *float64 `json:"weight_kg"`
	SkeletalMuscleKg *float64 `json:"skeletal_muscle_kg"`
	BodyFatPct       *float64 `json:"body_fat_percentage"`
	Memo             string   `json:"memo"`
}

func (h *MetricHandler) Record(w http.ResponseWriter, r *http.Request) {
	var req recordMetricRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	measuredAt, err := parseDate(req.MeasuredAt)
	if err != nil {
		writeError(w, err)
		return
	}

	record, err := h.metrics.Record(r.Context(), userID(r), usecase.RecordMetricInput{
		MeasuredAt:       measuredAt,
		HeightCm:         req.HeightCm,
		WeightKg:         req.WeightKg,
		SkeletalMuscleKg: req.SkeletalMuscleKg,
		BodyFatPct:       req.BodyFatPct,
		Memo:             req.Memo,
	})
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, record)
}

func (h *MetricHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.metrics.Delete(r.Context(), userID(r), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

func (h *MetricHandler) Latest(w http.ResponseWriter, r *http.Request) {
	record, err := h.metrics.Latest(r.Context(), userID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, record)
}

func (h *MetricHandler) History(w http.ResponseWriter, r *http.Request) {
	mr, err := parseRange(r)
	if err != nil {
		writeError(w, err)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))

	records, err := h.metrics.History(r.Context(), userID(r), mr, limit)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": records})
}

// Series 는 GET /api/v1/metrics/series?kind=weight_kg&user_id=...&from=&to= 를 처리한다.
// user_id 를 주면 같은 그룹에서 공유된 다른 사용자의 차트를 본다.
func (h *MetricHandler) Series(w http.ResponseWriter, r *http.Request) {
	mr, err := parseRange(r)
	if err != nil {
		writeError(w, err)
		return
	}

	kind := domain.MetricKind(r.URL.Query().Get("kind"))
	target := r.URL.Query().Get("user_id")

	series, err := h.metrics.Series(r.Context(), userID(r), target, kind, mr)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, series)
}

func parseRange(r *http.Request) (domain.MetricRange, error) {
	from, err := parseDate(r.URL.Query().Get("from"))
	if err != nil {
		return domain.MetricRange{}, err
	}
	to, err := parseDate(r.URL.Query().Get("to"))
	if err != nil {
		return domain.MetricRange{}, err
	}
	return domain.MetricRange{From: from, To: to}, nil
}

// parseDate 는 빈 문자열을 zero time 으로 허용한다(유스케이스가 기본값을 채운다).
func parseDate(value string) (time.Time, error) {
	if value == "" {
		return time.Time{}, nil
	}
	parsed, err := time.Parse(time.DateOnly, value)
	if err != nil {
		return time.Time{}, domain.ErrInvalidInput
	}
	return parsed, nil
}
