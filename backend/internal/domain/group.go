package domain

import (
	"context"
	"time"
)

type GroupRole string

const (
	GroupRoleOwner  GroupRole = "owner"
	GroupRoleMember GroupRole = "member"
)

// Group 은 운동 데이터를 공유하는 계정 묶음이다.
type Group struct {
	ID         string    `json:"id"`
	Name       string    `json:"name"`
	OwnerID    string    `json:"owner_id"`
	InviteCode string    `json:"invite_code"`
	CreatedAt  time.Time `json:"created_at"`
}

type GroupMember struct {
	GroupID     string    `json:"group_id"`
	UserID      string    `json:"user_id"`
	DisplayName string    `json:"display_name"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
	Role        GroupRole `json:"role"`
	ShareData   bool      `json:"share_data"` // false 면 지표를 그룹에 노출하지 않는다.
	JoinedAt    time.Time `json:"joined_at"`
}

type GroupRepository interface {
	Create(ctx context.Context, g *Group) error
	FindByID(ctx context.Context, id string) (*Group, error)
	FindByInviteCode(ctx context.Context, code string) (*Group, error)
	ListByUser(ctx context.Context, userID string) ([]Group, error)
	AddMember(ctx context.Context, m *GroupMember) error
	RemoveMember(ctx context.Context, groupID, userID string) error
	ListMembers(ctx context.Context, groupID string) ([]GroupMember, error)
	// IsMember 는 조회 권한 검사에 쓰인다.
	IsMember(ctx context.Context, groupID, userID string) (bool, error)
	// SharesWith 는 viewer 가 owner 와 같은 그룹에 속하고 owner 가 공유를 허용했는지 본다.
	SharesWith(ctx context.Context, viewerID, ownerID string) (bool, error)
}
