package postgres

import (
	"context"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type CoachRepository struct {
	pool *pgxpool.Pool
}

func NewCoachRepository(pool *pgxpool.Pool) *CoachRepository {
	return &CoachRepository{pool: pool}
}

var _ domain.CoachRepository = (*CoachRepository)(nil)

func (r *CoachRepository) CreateConversation(ctx context.Context, c *domain.Conversation) error {
	const q = `
		INSERT INTO coach_conversations (id, user_id, title, goal)
		VALUES ($1, $2, $3, $4)
		RETURNING created_at, updated_at`

	err := r.pool.QueryRow(ctx, q, c.ID, c.UserID, c.Title, string(c.Goal)).Scan(&c.CreatedAt, &c.UpdatedAt)
	return translate("coach repository: create conversation", err)
}

func (r *CoachRepository) FindConversation(ctx context.Context, userID, id string) (*domain.Conversation, error) {
	const q = `
		SELECT id, user_id, title, coalesce(goal, ''), created_at, updated_at
		  FROM coach_conversations
		 WHERE id = $1 AND user_id = $2`

	var c domain.Conversation
	var goal string
	err := r.pool.QueryRow(ctx, q, id, userID).Scan(&c.ID, &c.UserID, &c.Title, &goal, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, translate("coach repository: find conversation", err)
	}
	c.Goal = domain.Goal(goal)
	return &c, nil
}

func (r *CoachRepository) ListConversations(ctx context.Context, userID string, limit int) ([]domain.Conversation, error) {
	// idx_coach_conversations_user_updated_at (user_id, updated_at DESC) 를 탄다.
	const q = `
		SELECT id, user_id, title, coalesce(goal, ''), created_at, updated_at
		  FROM coach_conversations
		 WHERE user_id = $1
		 ORDER BY updated_at DESC
		 LIMIT $2`

	rows, err := r.pool.Query(ctx, q, userID, limit)
	if err != nil {
		return nil, translate("coach repository: list conversations", err)
	}
	defer rows.Close()

	conversations := make([]domain.Conversation, 0, 16)
	for rows.Next() {
		var c domain.Conversation
		var goal string
		if err := rows.Scan(&c.ID, &c.UserID, &c.Title, &goal, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, translate("coach repository: list conversations scan", err)
		}
		c.Goal = domain.Goal(goal)
		conversations = append(conversations, c)
	}
	return conversations, translate("coach repository: list conversations rows", rows.Err())
}

func (r *CoachRepository) AppendMessage(ctx context.Context, m *domain.ChatMessage) error {
	const q = `
		WITH inserted AS (
			INSERT INTO coach_messages (id, conversation_id, role, content)
			VALUES ($1, $2, $3, $4)
			RETURNING id, created_at, conversation_id
		), touched AS (
			UPDATE coach_conversations
			   SET updated_at = now()
			 WHERE id = (SELECT conversation_id FROM inserted)
		)
		SELECT created_at FROM inserted`

	err := r.pool.QueryRow(ctx, q, m.ID, m.ConversationID, string(m.Role), m.Content).Scan(&m.CreatedAt)
	return translate("coach repository: append message", err)
}

func (r *CoachRepository) ListMessages(ctx context.Context, conversationID string, limit int) ([]domain.ChatMessage, error) {
	// 최근 limit 개를 고른 뒤 다시 오름차순으로 되돌린다(LLM 입력 순서).
	const q = `
		SELECT id, conversation_id, role, content, created_at
		  FROM (
			SELECT id, conversation_id, role, content, created_at
			  FROM coach_messages
			 WHERE conversation_id = $1
			 ORDER BY created_at DESC
			 LIMIT $2
		  ) recent
		 ORDER BY created_at`

	rows, err := r.pool.Query(ctx, q, conversationID, limit)
	if err != nil {
		return nil, translate("coach repository: list messages", err)
	}
	defer rows.Close()

	messages := make([]domain.ChatMessage, 0, limit)
	for rows.Next() {
		var m domain.ChatMessage
		var role string
		if err := rows.Scan(&m.ID, &m.ConversationID, &role, &m.Content, &m.CreatedAt); err != nil {
			return nil, translate("coach repository: list messages scan", err)
		}
		m.Role = domain.ChatRole(role)
		messages = append(messages, m)
	}
	return messages, translate("coach repository: list messages rows", rows.Err())
}
