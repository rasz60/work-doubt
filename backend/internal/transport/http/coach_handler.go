package http

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/devsixt/workout/backend/internal/usecase"
)

type CoachHandler struct {
	coach *usecase.Coach
}

func NewCoachHandler(coach *usecase.Coach) *CoachHandler {
	return &CoachHandler{coach: coach}
}

type startConversationRequest struct {
	Goal  domain.Goal `json:"goal"`
	Title string      `json:"title"`
}

func (h *CoachHandler) StartConversation(w http.ResponseWriter, r *http.Request) {
	var req startConversationRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	conv, err := h.coach.StartConversation(r.Context(), userID(r), req.Goal, req.Title)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, conv)
}

func (h *CoachHandler) ListConversations(w http.ResponseWriter, r *http.Request) {
	conversations, err := h.coach.ListConversations(r.Context(), userID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": conversations})
}

func (h *CoachHandler) Messages(w http.ResponseWriter, r *http.Request) {
	messages, err := h.coach.Messages(r.Context(), userID(r), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": messages})
}

type askRequest struct {
	Question string `json:"question"`
}

// Ask 는 AI 응답을 SSE(text/event-stream) 로 흘린다.
// 이벤트: delta(토큰 조각) → done(메시지 메타) / error.
func (h *CoachHandler) Ask(w http.ResponseWriter, r *http.Request) {
	var req askRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, fmt.Errorf("coach handler: streaming unsupported"))
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // nginx 버퍼링 방지
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	send := func(event string, payload any) error {
		encoded, err := json.Marshal(payload)
		if err != nil {
			return fmt.Errorf("coach handler: marshal %s event: %w", event, err)
		}
		if _, err := fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, encoded); err != nil {
			return fmt.Errorf("coach handler: write %s event: %w", event, err)
		}
		flusher.Flush()
		return nil
	}

	message, err := h.coach.Ask(r.Context(), userID(r), r.PathValue("id"), req.Question, func(delta string) error {
		return send("delta", map[string]string{"text": delta})
	})
	if err != nil {
		slog.Error("coach ask", "error", err)
		// 헤더를 이미 보냈으므로 상태 코드 대신 error 이벤트로 알린다.
		_ = send("error", errorBody{Error: "stream_failed", Message: "답변 생성에 실패했습니다."})
		return
	}
	_ = send("done", message)
}
