package http

import (
	"net/http"

	"github.com/devsixt/workout/backend/internal/usecase"
)

type AccountHandler struct {
	account *usecase.Account
}

func NewAccountHandler(account *usecase.Account) *AccountHandler {
	return &AccountHandler{account: account}
}

func (h *AccountHandler) Me(w http.ResponseWriter, r *http.Request) {
	user, err := h.account.Me(r.Context(), userID(r))
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

func (h *AccountHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req updateProfileRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	user, err := h.account.UpdateProfile(r.Context(), userID(r), req.DisplayName, req.AvatarURL, req.HeightCm)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, user)
}
