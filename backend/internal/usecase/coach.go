package usecase

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/google/uuid"
)

// 추천 프롬프트에 함께 넣는 추세 지표.
var coachTrendKinds = []domain.MetricKind{
	domain.MetricWeight,
	domain.MetricSkeletalMuscle,
	domain.MetricBodyFatPct,
	domain.MetricBMI,
}

const historyWindow = 20 // LLM 에 보낼 최근 메시지 수

type Coach struct {
	repo    domain.CoachRepository
	users   domain.UserRepository
	metrics domain.BodyMetricRepository
	engine  domain.CoachEngine
}

func NewCoach(repo domain.CoachRepository, users domain.UserRepository, metrics domain.BodyMetricRepository, engine domain.CoachEngine) *Coach {
	return &Coach{repo: repo, users: users, metrics: metrics, engine: engine}
}

func (c *Coach) StartConversation(ctx context.Context, userID string, goal domain.Goal, title string) (*domain.Conversation, error) {
	if title == "" {
		title = "새 대화"
	}
	conv := &domain.Conversation{
		ID:     uuid.NewString(),
		UserID: userID,
		Title:  title,
		Goal:   goal,
	}
	if err := c.repo.CreateConversation(ctx, conv); err != nil {
		return nil, err
	}
	return conv, nil
}

func (c *Coach) ListConversations(ctx context.Context, userID string) ([]domain.Conversation, error) {
	return c.repo.ListConversations(ctx, userID, 50)
}

func (c *Coach) Messages(ctx context.Context, userID, conversationID string) ([]domain.ChatMessage, error) {
	if _, err := c.repo.FindConversation(ctx, userID, conversationID); err != nil {
		return nil, err
	}
	return c.repo.ListMessages(ctx, conversationID, 200)
}

// Ask 는 질문을 저장하고 AI 응답을 스트리밍한 뒤 전체 답변도 저장한다.
// onDelta 는 SSE 전송에 쓰이며, 에러를 반환하면 스트림을 중단한다.
func (c *Coach) Ask(ctx context.Context, userID, conversationID, question string, onDelta func(string) error) (*domain.ChatMessage, error) {
	question = strings.TrimSpace(question)
	if question == "" {
		return nil, fmt.Errorf("ask: question is empty: %w", domain.ErrInvalidInput)
	}

	conv, err := c.repo.FindConversation(ctx, userID, conversationID)
	if err != nil {
		return nil, err
	}

	userMsg := &domain.ChatMessage{
		ID:             uuid.NewString(),
		ConversationID: conv.ID,
		Role:           domain.ChatRoleUser,
		Content:        question,
	}
	if err := c.repo.AppendMessage(ctx, userMsg); err != nil {
		return nil, err
	}

	history, err := c.repo.ListMessages(ctx, conv.ID, historyWindow)
	if err != nil {
		return nil, err
	}
	coachCtx, err := c.buildContext(ctx, userID, conv.Goal)
	if err != nil {
		return nil, err
	}

	answer, err := c.engine.Stream(ctx, coachCtx, history, onDelta)
	if err != nil {
		return nil, err
	}

	assistantMsg := &domain.ChatMessage{
		ID:             uuid.NewString(),
		ConversationID: conv.ID,
		Role:           domain.ChatRoleAssistant,
		Content:        answer,
	}
	if err := c.repo.AppendMessage(ctx, assistantMsg); err != nil {
		return nil, err
	}
	return assistantMsg, nil
}

// buildContext 는 사용자 프로필과 최근 지표 추세를 모아 프롬프트 컨텍스트를 만든다.
func (c *Coach) buildContext(ctx context.Context, userID string, goal domain.Goal) (domain.CoachContext, error) {
	user, err := c.users.FindByID(ctx, userID)
	if err != nil {
		return domain.CoachContext{}, err
	}

	cc := domain.CoachContext{Goal: goal, DisplayName: user.DisplayName}

	latest, err := c.metrics.Latest(ctx, userID)
	if err != nil && !isNotFound(err) {
		return domain.CoachContext{}, err
	}
	cc.Latest = latest

	window := domain.MetricRange{From: time.Now().AddDate(0, -3, 0).UTC(), To: time.Now().UTC()}
	for _, kind := range coachTrendKinds {
		points, err := c.metrics.Series(ctx, userID, kind, window)
		if err != nil {
			return domain.CoachContext{}, err
		}
		if len(points) == 0 {
			continue
		}
		cc.Trend = append(cc.Trend, domain.MetricSeries{Kind: kind, Points: points, Stats: Summarize(points)})
	}
	return cc, nil
}
