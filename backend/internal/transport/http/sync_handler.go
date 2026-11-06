package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/devsixt/workout/backend/internal/usecase"
)

// SyncHandler 는 Apple 건강 연동 API 다.
type SyncHandler struct {
	sync *usecase.Sync
}

func NewSyncHandler(sync *usecase.Sync) *SyncHandler {
	return &SyncHandler{sync: sync}
}

type syncOverview struct {
	Connections []domain.SyncConnection `json:"connections"`
}

// Overview 는 GET /api/v1/sync — 연결 목록 (지금은 Apple 건강 하나).
func (h *SyncHandler) Overview(w http.ResponseWriter, r *http.Request) {
	conns, err := h.sync.Connections(r.Context(), userID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, syncOverview{Connections: conns})
}

// Disconnect 는 DELETE /api/v1/sync/connections/{id} — 연결을 끊는다 (받은 기록은 남는다).
func (h *SyncHandler) Disconnect(w http.ResponseWriter, r *http.Request) {
	if err := h.sync.Disconnect(r.Context(), userID(r), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// ── iPhone 앱 → 서버 ─────────────────────────────

// ingestItem 은 숫자를 문자열로 보내도 받는다 ("5.2", "5,2", "28 min" → 28).
type ingestItem struct {
	ID           flexString `json:"id"`
	Date         string     `json:"date"`
	Start        string     `json:"start"`
	Type         string     `json:"type"`
	Title        string     `json:"title"`
	DistanceKm   flexFloat  `json:"distance_km"`
	DistanceM    flexFloat  `json:"distance_m"`
	DurationSec  flexFloat  `json:"duration_sec"`
	DurationMin  flexFloat  `json:"duration_min"`
	CaloriesKcal flexFloat  `json:"calories_kcal"`
	AvgHeartRate flexFloat  `json:"avg_heart_rate"`
}

// ingestRequest 는 {"workouts": [...]} 또는 운동 하나를 그대로 보낸 {"date": …, "type": …} 를 받는다.
type ingestRequest struct {
	Workouts []ingestItem `json:"workouts"`
	ingestItem
}

// AppleHealth 는 POST /api/v1/sync/apple-health — iPhone 앱이 HealthKit 에서 읽은 운동을 보낸다 .
func (h *SyncHandler) AppleHealth(w http.ResponseWriter, r *http.Request) {
	defer r.Body.Close()
	var req ingestRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, fmt.Errorf("JSON 형식이 올바르지 않습니다: %w", domain.ErrInvalidInput))
		return
	}
	result, err := h.sync.AppleHealth(r.Context(), userID(r), req.toWorkouts())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (req ingestRequest) toWorkouts() []usecase.IngestWorkout {
	items := req.Workouts
	if len(items) == 0 && (req.Date != "" || req.Start != "") {
		items = []ingestItem{req.ingestItem}
	}

	workouts := make([]usecase.IngestWorkout, 0, len(items))
	for _, it := range items {
		workouts = append(workouts, usecase.IngestWorkout{
			ID:           string(it.ID),
			Date:         it.Date,
			Start:        it.Start,
			Type:         it.Type,
			Title:        it.Title,
			DistanceKm:   it.DistanceKm.v,
			DistanceM:    it.DistanceM.v,
			DurationSec:  it.DurationSec.v,
			DurationMin:  it.DurationMin.v,
			CaloriesKcal: it.CaloriesKcal.v,
			AvgHeartRate: it.AvgHeartRate.v,
		})
	}
	return workouts
}

var leadingNumber = regexp.MustCompile(`^-?\d+(?:[.,]\d+)?`)

type flexFloat struct{ v *float64 }

func (f *flexFloat) UnmarshalJSON(b []byte) error {
	b = bytes.TrimSpace(b)
	if bytes.Equal(b, []byte("null")) {
		return nil
	}
	var n float64
	if err := json.Unmarshal(b, &n); err == nil {
		f.v = &n
		return nil
	}
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return errors.New("number expected")
	}
	match := leadingNumber.FindString(strings.TrimSpace(s))
	if match == "" {
		return nil // 빈 문자열 등은 값 없음
	}
	n, err := strconv.ParseFloat(strings.Replace(match, ",", ".", 1), 64)
	if err != nil {
		return nil
	}
	f.v = &n
	return nil
}

type flexString string

func (f *flexString) UnmarshalJSON(b []byte) error {
	var s string
	if err := json.Unmarshal(b, &s); err == nil {
		*f = flexString(s)
		return nil
	}
	var n json.Number
	if err := json.Unmarshal(b, &n); err == nil {
		*f = flexString(n.String())
	}
	return nil
}
