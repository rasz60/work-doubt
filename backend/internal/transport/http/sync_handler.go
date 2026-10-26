package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/devsixt/workout/backend/internal/usecase"
)

// SyncHandler 는 기기 · 앱 연동 API 다.
type SyncHandler struct {
	sync      *usecase.Sync
	ingestURL string // 기기 자동화가 기록을 보낼 주소 (화면에 보여 준다)
	appURL    string // Strava 동의 뒤 돌아갈 앱 화면 (PROFILE)
}

func NewSyncHandler(sync *usecase.Sync, ingestURL, appURL string) *SyncHandler {
	return &SyncHandler{sync: sync, ingestURL: ingestURL, appURL: appURL}
}

type syncOverview struct {
	StravaEnabled bool                    `json:"strava_enabled"`
	IngestURL     string                  `json:"ingest_url"`
	Connections   []domain.SyncConnection `json:"connections"`
}

// Overview 는 GET /api/v1/sync — 연결된 기기와 연결할 수 있는 방법.
func (h *SyncHandler) Overview(w http.ResponseWriter, r *http.Request) {
	conns, err := h.sync.Connections(r.Context(), userID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, syncOverview{StravaEnabled: h.sync.StravaEnabled(), IngestURL: h.ingestURL, Connections: conns})
}

type runSyncRequest struct {
	Force bool `json:"force"`
}

// Run 은 POST /api/v1/sync/run — Strava 연결에서 새 활동을 가져온다 (force 가 아니면 10분에 한 번).
func (h *SyncHandler) Run(w http.ResponseWriter, r *http.Request) {
	var req runSyncRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	conns, err := h.sync.SyncAll(r.Context(), userID(r), req.Force)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, syncOverview{StravaEnabled: h.sync.StravaEnabled(), IngestURL: h.ingestURL, Connections: conns})
}

type importRequest struct {
	From string `json:"from"`
	To   string `json:"to"`
}

// Import 는 POST /api/v1/sync/connections/{id}/import — 날짜(from=to) · 기간 · 전체(둘 다 비움)의 활동을 가져온다.
func (h *SyncHandler) Import(w http.ResponseWriter, r *http.Request) {
	var req importRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	result, err := h.sync.Import(r.Context(), userID(r), r.PathValue("id"), req.From, req.To)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *SyncHandler) Disconnect(w http.ResponseWriter, r *http.Request) {
	if err := h.sync.Disconnect(r.Context(), userID(r), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

// StravaAuthorize 는 GET /api/v1/sync/strava/authorize — 앱이 이 주소로 이동하면 Strava 동의 화면이 뜬다.
func (h *SyncHandler) StravaAuthorize(w http.ResponseWriter, r *http.Request) {
	authURL, err := h.sync.StravaAuthURL(userID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"url": authURL})
}

// StravaCallback 은 Strava 동의 화면이 돌려보내는 주소다. 브라우저 이동이라 로그인 토큰이 없고, state 로 사용자를 안다.
// 결과는 앱 PROFILE 화면으로 돌려보내며 알린다 (?sync=strava&result=ok|denied|failed).
func (h *SyncHandler) StravaCallback(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	result := "ok"
	switch {
	case q.Get("error") != "":
		result = "denied"
	case !strings.Contains(q.Get("scope"), "activity:read"):
		result = "denied" // 활동 읽기 권한 체크를 끄고 승인한 경우
	default:
		if err := h.sync.StravaCallback(r.Context(), q.Get("state"), q.Get("code")); err != nil {
			slog.Warn("strava callback", "error", err)
			result = "failed"
		}
	}
	target := h.appURL + "?" + url.Values{"sync": {"strava"}, "result": {result}}.Encode()
	http.Redirect(w, r, target, http.StatusFound)
}

type createDeviceRequest struct {
	Name string `json:"name"`
}

type createDeviceResponse struct {
	Connection *domain.SyncConnection `json:"connection"`
	Token      string                 `json:"token"` // 이번 한 번만 보여 준다
	IngestURL  string                 `json:"ingest_url"`
}

func (h *SyncHandler) CreateDevice(w http.ResponseWriter, r *http.Request) {
	var req createDeviceRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}
	conn, token, err := h.sync.CreateDevice(r.Context(), userID(r), req.Name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, createDeviceResponse{Connection: conn, Token: token, IngestURL: h.ingestURL})
}

// ── 기기 → 서버 (로그인 토큰 대신 기기 토큰) ─────────────────────────────

// ingestItem 은 폰 자동화가 만들기 쉽게 숫자를 문자열로 보내도 받는다 ("5.2", "5,2", "28 min" → 28).
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

// Ingest 는 POST /api/v1/sync/ingest (Authorization: Bearer wkd_…).
func (h *SyncHandler) Ingest(w http.ResponseWriter, r *http.Request) {
	token, ok := bearerToken(r.Header.Get("Authorization"))
	if !ok {
		writeError(w, fmt.Errorf("ingest: missing device token: %w", domain.ErrUnauthorized))
		return
	}

	defer r.Body.Close()
	var req ingestRequest
	// 단축어 등이 덧붙이는 다른 값은 무시한다 (DisallowUnknownFields 를 쓰지 않는다)
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, fmt.Errorf("JSON 형식이 올바르지 않습니다: %w", domain.ErrInvalidInput))
		return
	}
	result, err := h.sync.Ingest(r.Context(), token, req.toWorkouts())
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// AppleHealth 는 POST /api/v1/sync/apple-health — iPhone 앱이 HealthKit 에서 읽은 운동을 보낸다 (형식은 ingest 와 같다).
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
