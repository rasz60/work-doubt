package http

import (
	"net/http"

	"github.com/devsixt/workout/backend/internal/usecase"
)

// TesterHandler 는 공용 테스터 계정(P-0004)의 정리 API 다.
type TesterHandler struct {
	tester *usecase.Tester
}

func NewTesterHandler(tester *usecase.Tester) *TesterHandler {
	return &TesterHandler{tester: tester}
}

type resetResponse struct {
	Deleted int `json:"deleted"`
}

// Reset 은 POST /api/v1/tester/reset — 테스터가 새로 만든 데이터를 지운다 (기본 데이터는 남는다).
func (h *TesterHandler) Reset(w http.ResponseWriter, r *http.Request) {
	n, err := h.tester.Reset(r.Context(), userID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, resetResponse{Deleted: n})
}

// blockTester 는 테스터 계정이면 막은 기능으로 거절한다 (403 tester_blocked). requireAuth 안쪽에 둔다.
func blockTester(tester *usecase.Tester, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := tester.Guard(r.Context(), userID(r)); err != nil {
			writeError(w, err)
			return
		}
		next(w, r)
	}
}
