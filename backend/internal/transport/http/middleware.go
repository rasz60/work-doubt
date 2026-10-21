package http

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/devsixt/workout/backend/internal/platform/auth"
	"github.com/devsixt/workout/backend/internal/usecase"
)

type ctxKey string

const ctxKeyUserID ctxKey = "user_id"

// requireAuth 는 Supabase access token(Bearer)을 검증하고 user id 를 컨텍스트에 심는다.
// 처음 들어온 사용자는 프로필(workout.profiles)을 만든다.
func requireAuth(verifier *auth.Verifier, account *usecase.Account, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		token, ok := bearerToken(header)
		if !ok {
			// SSE 처럼 헤더를 못 붙이는 클라이언트를 위해 쿼리 파라미터도 허용한다.
			token = r.URL.Query().Get("access_token")
		}
		if token == "" {
			writeError(w, fmt.Errorf("auth middleware: missing bearer token: %w", domain.ErrUnauthorized))
			return
		}

		claims, err := verifier.Verify(r.Context(), token)
		if err != nil {
			writeError(w, fmt.Errorf("auth middleware: %v: %w", err, domain.ErrUnauthorized))
			return
		}
		if err := account.Ensure(r.Context(), claims.Subject, claims.Email); err != nil {
			writeError(w, err)
			return
		}

		ctx := context.WithValue(r.Context(), ctxKeyUserID, claims.Subject)
		next(w, r.WithContext(ctx))
	}
}

func userID(r *http.Request) string {
	id, _ := r.Context().Value(ctxKeyUserID).(string)
	return id
}

func bearerToken(header string) (string, bool) {
	const prefix = "Bearer "
	if len(header) > len(prefix) && strings.EqualFold(header[:len(prefix)], prefix) {
		return strings.TrimSpace(header[len(prefix):]), true
	}
	return "", false
}

// withCORS 는 웹 클라이언트(React Native Web) 를 위한 프리플라이트를 처리한다.
// 포털 아래(같은 도메인)에서는 필요 없지만, 로컬 개발(Expo 웹 서버)과 네이티브 앱 개발용으로 둔다.
func withCORS(allowOrigin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowOrigin)
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Vary", "Origin")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// withLogging 은 요청 1건당 1줄을 남긴다.
func withLogging(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}

		next.ServeHTTP(recorder, r)

		slog.Info("http",
			"method", r.Method,
			"path", r.URL.Path,
			"status", recorder.status,
			"duration_ms", time.Since(started).Milliseconds(),
		)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// Flush 는 SSE 응답이 statusRecorder 를 거쳐도 즉시 전송되도록 위임한다.
func (s *statusRecorder) Flush() {
	if f, ok := s.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
