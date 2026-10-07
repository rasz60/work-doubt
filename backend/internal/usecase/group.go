package usecase

import (
	"context"
	"crypto/rand"
	"errors"
	"fmt"
	"strings"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/google/uuid"
)

const inviteCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // 혼동되는 0/O/1/I 제외

type Group struct {
	groups domain.GroupRepository
}

func NewGroup(groups domain.GroupRepository) *Group {
	return &Group{groups: groups}
}

// Create 는 그룹을 만들고 생성자를 owner 로 등록한다.
func (g *Group) Create(ctx context.Context, ownerID, name string) (*domain.Group, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, fmt.Errorf("create group: name is required: %w", domain.ErrInvalidInput)
	}

	code, err := inviteCode(8)
	if err != nil {
		return nil, err
	}

	group := &domain.Group{
		ID:         uuid.NewString(),
		Name:       name,
		OwnerID:    ownerID,
		InviteCode: code,
	}
	if err := g.groups.Create(ctx, group); err != nil {
		return nil, err
	}
	if err := g.groups.AddMember(ctx, &domain.GroupMember{
		GroupID:   group.ID,
		UserID:    ownerID,
		Role:      domain.GroupRoleOwner,
		ShareData: true,
	}); err != nil {
		return nil, err
	}
	return group, nil
}

func (g *Group) List(ctx context.Context, userID string) ([]domain.Group, error) {
	return g.groups.ListByUser(ctx, userID)
}

// Join 은 초대 코드로 그룹에 참여한다. shareData 가 false 면 본인 지표는 숨긴다.
func (g *Group) Join(ctx context.Context, userID, code string, shareData bool) (*domain.Group, error) {
	code = strings.ToUpper(strings.TrimSpace(code))
	if code == "" {
		return nil, fmt.Errorf("join group: invite code is required: %w", domain.ErrInvalidInput)
	}

	group, err := g.groups.FindByInviteCode(ctx, code)
	if err != nil {
		return nil, err
	}

	member, err := g.groups.IsMember(ctx, group.ID, userID)
	if err != nil {
		return nil, err
	}
	if member {
		return group, nil
	}

	if err := g.groups.AddMember(ctx, &domain.GroupMember{
		GroupID:   group.ID,
		UserID:    userID,
		Role:      domain.GroupRoleMember,
		ShareData: shareData,
	}); err != nil {
		return nil, err
	}
	return group, nil
}

// Members 는 그룹 구성원을 반환한다. 호출자는 그룹 멤버여야 한다.
func (g *Group) Members(ctx context.Context, viewerID, groupID string) ([]domain.GroupMember, error) {
	member, err := g.groups.IsMember(ctx, groupID, viewerID)
	if err != nil {
		return nil, err
	}
	if !member {
		return nil, fmt.Errorf("list members: %s is not in group %s: %w", viewerID, groupID, domain.ErrForbidden)
	}
	return g.groups.ListMembers(ctx, groupID)
}

func (g *Group) Leave(ctx context.Context, userID, groupID string) error {
	return g.groups.RemoveMember(ctx, groupID, userID)
}

func inviteCode(n int) (string, error) {
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("invite code: read random: %w", err)
	}
	for i, b := range buf {
		buf[i] = inviteCodeAlphabet[int(b)%len(inviteCodeAlphabet)]
	}
	return string(buf), nil
}

func isNotFound(err error) bool {
	return errors.Is(err, domain.ErrNotFound)
}
