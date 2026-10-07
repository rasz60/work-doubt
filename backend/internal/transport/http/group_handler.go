package http

import (
	"net/http"

	"github.com/devsixt/workout/backend/internal/usecase"
)

type GroupHandler struct {
	groups *usecase.Group
}

func NewGroupHandler(groups *usecase.Group) *GroupHandler {
	return &GroupHandler{groups: groups}
}

type createGroupRequest struct {
	Name string `json:"name"`
}

func (h *GroupHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createGroupRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	group, err := h.groups.Create(r.Context(), userID(r), req.Name)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, group)
}

func (h *GroupHandler) List(w http.ResponseWriter, r *http.Request) {
	groups, err := h.groups.List(r.Context(), userID(r))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": groups})
}

type joinGroupRequest struct {
	InviteCode string `json:"invite_code"`
	ShareData  bool   `json:"share_data"`
}

func (h *GroupHandler) Join(w http.ResponseWriter, r *http.Request) {
	var req joinGroupRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, err)
		return
	}

	group, err := h.groups.Join(r.Context(), userID(r), req.InviteCode, req.ShareData)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, group)
}

func (h *GroupHandler) Members(w http.ResponseWriter, r *http.Request) {
	members, err := h.groups.Members(r.Context(), userID(r), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": members})
}

func (h *GroupHandler) Leave(w http.ResponseWriter, r *http.Request) {
	if err := h.groups.Leave(r.Context(), userID(r), r.PathValue("id")); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusNoContent, nil)
}
