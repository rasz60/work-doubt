package domain

import (
	"context"
	"time"
)

type ChatRole string

const (
	ChatRoleUser      ChatRole = "user"
	ChatRoleAssistant ChatRole = "assistant"
)

// Goal 은 추천 로직이 참고하는 사용자의 목적이다.
type Goal string

const (
	GoalFatLoss     Goal = "fat_loss"
	GoalMuscleGain  Goal = "muscle_gain"
	GoalEndurance   Goal = "endurance"
	GoalMaintenance Goal = "maintenance"
	GoalRehab       Goal = "rehab"
)

type Conversation struct {
	ID        string    `json:"id"`
	UserID    string    `json:"user_id"`
	Title     string    `json:"title"`
	Goal      Goal      `json:"goal"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type ChatMessage struct {
	ID             string    `json:"id"`
	ConversationID string    `json:"conversation_id"`
	Role           ChatRole  `json:"role"`
	Content        string    `json:"content"`
	CreatedAt      time.Time `json:"created_at"`
}

type CoachRepository interface {
	CreateConversation(ctx context.Context, c *Conversation) error
	FindConversation(ctx context.Context, userID, id string) (*Conversation, error)
	ListConversations(ctx context.Context, userID string, limit int) ([]Conversation, error)
	AppendMessage(ctx context.Context, m *ChatMessage) error
	ListMessages(ctx context.Context, conversationID string, limit int) ([]ChatMessage, error)
}

// CoachContext 는 LLM 에 주입할 사용자 상태 요약이다.
type CoachContext struct {
	Goal        Goal
	DisplayName string
	Latest      *BodyMetric
	Trend       []MetricSeries
}

// CoachEngine 은 AI 공급자 포트다. 구현은 internal/platform/ai 에 둔다.
type CoachEngine interface {
	// Stream 은 델타를 onDelta 로 흘리고 전체 응답 텍스트를 반환한다.
	Stream(ctx context.Context, cc CoachContext, history []ChatMessage, onDelta func(string) error) (string, error)
}
