package http

import (
	"net/http"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/devsixt/workout/backend/internal/usecase"
)

type AuthHandler struct {
	auth *usecase.Auth
}

func NewAuthHandler(auth *usecase.Auth) *AuthHandler {
	return &AuthHandler{auth: auth}
}

type registerRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"display_name"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	session, err := h.auth.Register(r.Context(), req.Email, req.Password, req.DisplayName)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, session)
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	session, err := h.auth.Login(r.Context(), req.Email, req.Password)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

type socialLoginRequest struct {
	Code        string `json:"code"`
	RedirectURL string `json:"redirect_url"`
}

// SocialLogin 은 POST /api/v1/auth/social/{provider} 를 처리한다.
func (h *AuthHandler) SocialLogin(w http.ResponseWriter, r *http.Request) {
	var req socialLoginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	provider := domain.Provider(r.PathValue("provider"))
	session, err := h.auth.SocialLogin(r.Context(), provider, req.Code, req.RedirectURL)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

type refreshRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var req refreshRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	session, err := h.auth.Refresh(r.Context(), req.RefreshToken)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, session)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if err := h.auth.Logout(r.Context(), userID(r)); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, err := h.auth.Me(r.Context(), userID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, user)
}

type updateProfileRequest struct {
	DisplayName string   `json:"display_name"`
	AvatarURL   string   `json:"avatar_url"`
	HeightCm    *float64 `json:"height_cm"`
}

func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req updateProfileRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	user, err := h.auth.UpdateProfile(r.Context(), userID(r), req.DisplayName, req.AvatarURL, req.HeightCm)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, user)
}
