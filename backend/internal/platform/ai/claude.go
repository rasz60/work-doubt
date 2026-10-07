package ai

import (
	"context"
	"fmt"
	"strings"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/devsixt/workout/backend/internal/domain"
)

const systemPrompt = `당신은 자격을 갖춘 운동 코치입니다. 사용자의 목표와 최근 신체 지표 변화를 근거로 구체적인 운동법을 제안합니다.

규칙:
- 답변은 한국어로, 실행 가능한 수준까지 구체적으로 작성합니다(종목, 세트, 반복수, 주당 빈도, 강도).
- 사용자 지표가 주어지면 반드시 그 수치를 근거로 언급합니다. 지표가 없으면 먼저 무엇을 입력해야 하는지 알려줍니다.
- 의학적 진단이나 치료를 하지 않습니다. 통증, 부상, 질환 신호가 보이면 전문의 상담을 권고합니다.
- 추측한 수치를 사실처럼 말하지 않습니다.`

// Claude 는 domain.CoachEngine 의 Anthropic 구현이다.
type Claude struct {
	client anthropic.Client
	model  string
}

func NewClaude(apiKey, model string) *Claude {
	opts := []option.RequestOption{}
	if apiKey != "" {
		opts = append(opts, option.WithAPIKey(apiKey))
	}
	if model == "" {
		model = "claude-opus-5"
	}
	return &Claude{client: anthropic.NewClient(opts...), model: model}
}

// Stream 은 SSE 핸들러가 델타를 바로 흘릴 수 있도록 onDelta 콜백을 호출한다.
func (c *Claude) Stream(ctx context.Context, cc domain.CoachContext, history []domain.ChatMessage, onDelta func(string) error) (string, error) {
	messages := make([]anthropic.MessageParam, 0, len(history))
	for _, m := range history {
		block := anthropic.NewTextBlock(m.Content)
		switch m.Role {
		case domain.ChatRoleAssistant:
			messages = append(messages, anthropic.NewAssistantMessage(block))
		default:
			messages = append(messages, anthropic.NewUserMessage(block))
		}
	}
	if len(messages) == 0 {
		return "", fmt.Errorf("ai: empty conversation: %w", domain.ErrInvalidInput)
	}

	adaptive := anthropic.ThinkingConfigAdaptiveParam{}
	params := anthropic.MessageNewParams{
		Model:     anthropic.Model(c.model),
		MaxTokens: 8000,
		Thinking:  anthropic.ThinkingConfigParamUnion{OfAdaptive: &adaptive},
		System: []anthropic.TextBlockParam{
			// 고정 프롬프트를 먼저 캐시하고, 매 요청마다 바뀌는 사용자 컨텍스트는 그 뒤에 둔다.
			{Text: systemPrompt, CacheControl: anthropic.NewCacheControlEphemeralParam()},
			{Text: renderContext(cc)},
		},
		Messages: messages,
	}

	stream := c.client.Messages.NewStreaming(ctx, params)
	var full strings.Builder

	for stream.Next() {
		event := stream.Current()
		switch variant := event.AsAny().(type) {
		case anthropic.ContentBlockDeltaEvent:
			delta, ok := variant.Delta.AsAny().(anthropic.TextDelta)
			if !ok {
				continue
			}
			full.WriteString(delta.Text)
			if err := onDelta(delta.Text); err != nil {
				return full.String(), fmt.Errorf("ai: deliver delta: %w", err)
			}
		}
	}
	if err := stream.Err(); err != nil {
		return full.String(), fmt.Errorf("ai: stream: %w", err)
	}
	return full.String(), nil
}

// renderContext 는 사용자 지표를 프롬프트용 텍스트로 직렬화한다.
func renderContext(cc domain.CoachContext) string {
	var b strings.Builder
	b.WriteString("## 사용자 컨텍스트\n")
	fmt.Fprintf(&b, "- 이름: %s\n", cc.DisplayName)
	fmt.Fprintf(&b, "- 목표: %s\n", goalLabel(cc.Goal))

	if cc.Latest == nil {
		b.WriteString("- 기록된 신체 지표 없음\n")
		return b.String()
	}

	fmt.Fprintf(&b, "- 최근 측정일: %s\n", cc.Latest.MeasuredAt.Format("2006-01-02"))
	writeMetric(&b, "키(cm)", cc.Latest.HeightCm)
	writeMetric(&b, "체중(kg)", cc.Latest.WeightKg)
	writeMetric(&b, "골격근량(kg)", cc.Latest.SkeletalMuscleKg)
	writeMetric(&b, "체지방률(%)", cc.Latest.BodyFatPct)
	writeMetric(&b, "BMI", cc.Latest.BMI)

	if len(cc.Trend) > 0 {
		b.WriteString("- 최근 변동폭:\n")
		for _, s := range cc.Trend {
			if len(s.Points) == 0 {
				continue
			}
			fmt.Fprintf(&b, "  - %s: %.1f → %.1f (%+.1f, 최소 %.1f / 최대 %.1f, %d회 측정)\n",
				s.Kind, s.Stats.First, s.Stats.Last, s.Stats.Delta, s.Stats.Min, s.Stats.Max, len(s.Points))
		}
	}
	return b.String()
}

func writeMetric(b *strings.Builder, label string, v *float64) {
	if v == nil {
		return
	}
	fmt.Fprintf(b, "- %s: %.1f\n", label, *v)
}

func goalLabel(g domain.Goal) string {
	switch g {
	case domain.GoalFatLoss:
		return "체지방 감량"
	case domain.GoalMuscleGain:
		return "근육량 증가"
	case domain.GoalEndurance:
		return "지구력 향상"
	case domain.GoalMaintenance:
		return "체형 유지"
	case domain.GoalRehab:
		return "재활 / 통증 관리"
	default:
		return "미지정"
	}
}
