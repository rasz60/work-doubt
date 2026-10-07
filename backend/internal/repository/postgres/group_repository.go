package postgres

import (
	"context"
	"fmt"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type GroupRepository struct {
	pool *pgxpool.Pool
}

func NewGroupRepository(pool *pgxpool.Pool) *GroupRepository {
	return &GroupRepository{pool: pool}
}

var _ domain.GroupRepository = (*GroupRepository)(nil)

func (r *GroupRepository) Create(ctx context.Context, g *domain.Group) error {
	const q = `
		INSERT INTO groups (id, name, owner_id, invite_code)
		VALUES ($1, $2, $3, $4)
		RETURNING created_at`

	err := r.pool.QueryRow(ctx, q, g.ID, g.Name, g.OwnerID, g.InviteCode).Scan(&g.CreatedAt)
	return translate("group repository: create", err)
}

func (r *GroupRepository) FindByID(ctx context.Context, id string) (*domain.Group, error) {
	const q = `SELECT id, name, owner_id, invite_code, created_at FROM groups WHERE id = $1`
	return r.scanOne(ctx, "group repository: find by id", q, id)
}

func (r *GroupRepository) FindByInviteCode(ctx context.Context, code string) (*domain.Group, error) {
	const q = `SELECT id, name, owner_id, invite_code, created_at FROM groups WHERE invite_code = $1`
	return r.scanOne(ctx, "group repository: find by invite code", q, code)
}

func (r *GroupRepository) ListByUser(ctx context.Context, userID string) ([]domain.Group, error) {
	// idx_group_members_user_id 로 멤버십을 좁힌 뒤 groups PK 로 조인한다.
	const q = `
		SELECT g.id, g.name, g.owner_id, g.invite_code, g.created_at
		  FROM groups g
		  JOIN group_members m ON m.group_id = g.id
		 WHERE m.user_id = $1
		 ORDER BY g.created_at`

	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, translate("group repository: list by user", err)
	}
	defer rows.Close()

	groups := make([]domain.Group, 0, 8)
	for rows.Next() {
		var g domain.Group
		if err := rows.Scan(&g.ID, &g.Name, &g.OwnerID, &g.InviteCode, &g.CreatedAt); err != nil {
			return nil, translate("group repository: list by user scan", err)
		}
		groups = append(groups, g)
	}
	return groups, translate("group repository: list by user rows", rows.Err())
}

func (r *GroupRepository) AddMember(ctx context.Context, m *domain.GroupMember) error {
	const q = `
		INSERT INTO group_members (group_id, user_id, role, share_data)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (group_id, user_id) DO UPDATE SET share_data = excluded.share_data
		RETURNING joined_at`

	err := r.pool.QueryRow(ctx, q, m.GroupID, m.UserID, string(m.Role), m.ShareData).Scan(&m.JoinedAt)
	return translate("group repository: add member", err)
}

func (r *GroupRepository) RemoveMember(ctx context.Context, groupID, userID string) error {
	const q = `DELETE FROM group_members WHERE group_id = $1 AND user_id = $2`

	tag, err := r.pool.Exec(ctx, q, groupID, userID)
	if err != nil {
		return translate("group repository: remove member", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("group repository: remove member %s: %w", userID, domain.ErrNotFound)
	}
	return nil
}

func (r *GroupRepository) ListMembers(ctx context.Context, groupID string) ([]domain.GroupMember, error) {
	const q = `
		SELECT m.group_id, m.user_id, u.display_name, coalesce(u.avatar_url, ''),
		       m.role, m.share_data, m.joined_at
		  FROM group_members m
		  JOIN users u ON u.id = m.user_id
		 WHERE m.group_id = $1
		 ORDER BY m.joined_at`

	rows, err := r.pool.Query(ctx, q, groupID)
	if err != nil {
		return nil, translate("group repository: list members", err)
	}
	defer rows.Close()

	members := make([]domain.GroupMember, 0, 16)
	for rows.Next() {
		var m domain.GroupMember
		var role string
		if err := rows.Scan(&m.GroupID, &m.UserID, &m.DisplayName, &m.AvatarURL, &role, &m.ShareData, &m.JoinedAt); err != nil {
			return nil, translate("group repository: list members scan", err)
		}
		m.Role = domain.GroupRole(role)
		members = append(members, m)
	}
	return members, translate("group repository: list members rows", rows.Err())
}

func (r *GroupRepository) IsMember(ctx context.Context, groupID, userID string) (bool, error) {
	const q = `SELECT exists(SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2)`

	var ok bool
	if err := r.pool.QueryRow(ctx, q, groupID, userID).Scan(&ok); err != nil {
		return false, translate("group repository: is member", err)
	}
	return ok, nil
}

// SharesWith 는 viewer 와 owner 가 같은 그룹에 있고 owner 가 공유를 켜 두었는지 확인한다.
func (r *GroupRepository) SharesWith(ctx context.Context, viewerID, ownerID string) (bool, error) {
	const q = `
		SELECT exists(
			SELECT 1
			  FROM group_members viewer
			  JOIN group_members owner ON owner.group_id = viewer.group_id
			 WHERE viewer.user_id = $1
			   AND owner.user_id = $2
			   AND owner.share_data
		)`

	var ok bool
	if err := r.pool.QueryRow(ctx, q, viewerID, ownerID).Scan(&ok); err != nil {
		return false, translate("group repository: shares with", err)
	}
	return ok, nil
}

func (r *GroupRepository) scanOne(ctx context.Context, op, query string, args ...any) (*domain.Group, error) {
	var g domain.Group
	err := r.pool.QueryRow(ctx, query, args...).Scan(&g.ID, &g.Name, &g.OwnerID, &g.InviteCode, &g.CreatedAt)
	if err != nil {
		return nil, translate(op, err)
	}
	return &g, nil
}
