package http

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/devsixt/workout/backend/internal/domain"
)

func TestIngestRequestDecoding(t *testing.T) {
	// 폰 자동화는 숫자를 문자열 · 단위 붙은 문자열 · 쉼표 소수로 보내기도 한다
	body := `{"workouts":[{"id":12345,"date":"2026-10-21","type":"Running","distance_km":"5,2","duration_min":"28 min","calories_kcal":321.5,"extra":"ignored"},
		{"id":"abc","start":"2026-10-20T07:00:00+09:00","distance_m":"","duration_sec":null}]}`

	var req ingestRequest
	if err := json.Unmarshal([]byte(body), &req); err != nil {
		t.Fatal(err)
	}
	if len(req.Workouts) != 2 {
		t.Fatalf("workouts = %d", len(req.Workouts))
	}
	first := req.Workouts[0]
	if first.ID != "12345" || *first.DistanceKm.v != 5.2 || *first.DurationMin.v != 28 || *first.CaloriesKcal.v != 321.5 {
		t.Errorf("first = %+v", first)
	}
	second := req.Workouts[1]
	if second.ID != "abc" || second.DistanceM.v != nil || second.DurationSec.v != nil {
		t.Errorf("second = %+v", second)
	}

	// 운동 하나를 그대로 보낸 형태
	var single ingestRequest
	if err := json.Unmarshal([]byte(`{"date":"2026-10-21","type":"러닝","distance_km":3}`), &single); err != nil {
		t.Fatal(err)
	}
	if len(single.Workouts) != 0 || single.Date != "2026-10-21" || *single.DistanceKm.v != 3 {
		t.Errorf("single = %+v", single)
	}
}

func TestUserMessage(t *testing.T) {
	wrapped := fmt.Errorf("러닝은 거리나 시간 중 하나는 입력하세요: %w", domain.ErrInvalidInput)
	if got := userMessage(wrapped); got != "러닝은 거리나 시간 중 하나는 입력하세요" {
		t.Errorf("userMessage = %q", got)
	}
}
