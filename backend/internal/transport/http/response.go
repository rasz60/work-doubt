package http

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/devsixt/workout/backend/internal/domain"
)

type errorBody struct {
	Error   string `json:"error"`
	Message string `json:"message"`
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Error("write json response", "error", err)
	}
}

// writeError 는 도메인 센티널 에러를 HTTP 상태 코드로 매핑한다.
func writeError(w http.ResponseWriter, err error) {
	status, code := http.StatusInternalServerError, "internal_error"

	switch {
	case errors.Is(err, domain.ErrInvalidInput):
		status, code = http.StatusBadRequest, "invalid_input"
	case errors.Is(err, domain.ErrUnauthorized):
		status, code = http.StatusUnauthorized, "unauthorized"
	case errors.Is(err, domain.ErrForbidden):
		status, code = http.StatusForbidden, "forbidden"
	case errors.Is(err, domain.ErrNotFound):
		status, code = http.StatusNotFound, "not_found"
	case errors.Is(err, domain.ErrConflict):
		status, code = http.StatusConflict, "conflict"
	}

	if status >= http.StatusInternalServerError {
		slog.Error("request failed", "error", err)
		writeJSON(w, status, errorBody{Error: code, Message: "요청을 처리할 수 없습니다."})
		return
	}
	writeJSON(w, status, errorBody{Error: code, Message: err.Error()})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	defer r.Body.Close()

	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return errors.Join(domain.ErrInvalidInput, err)
	}
	return nil
}
