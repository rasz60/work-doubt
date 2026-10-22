package usecase

import (
	"context"
	"fmt"
	"math"

	"github.com/devsixt/workout/backend/internal/domain"
)

// ImportResult 는 연동 기록 가져오기 결과다.
type ImportResult struct {
	Fetched    int      `json:"fetched"`    // 받은 활동 수 (날짜로 거른 뒤)
	Saved      int      `json:"saved"`      // 새로 넣은 기록
	Duplicates int      `json:"duplicates"` // 이미 있어서 건너뛴 기록
	Skipped    int      `json:"skipped"`    // 기록할 수 없어 건너뛴 활동 (거리 · 시간 없음, 미래 날짜 등)
	Errors     []string `json:"errors,omitempty"`
}

// importActivities 는 연동 활동을 기록으로 넣는다. 이미 있는 기록은 고치지 않고 건너뛴다.
//   - 같은 연결에서 온 같은 활동 (external_id 가 같다) — 같은 날 같은 시간 기록을 다시 가져온 경우
//   - 다른 출처의 같은 운동 (직접 입력한 것, 다른 기기로 들어온 것) — IsDuplicate
func (s *Sync) importActivities(ctx context.Context, conn *domain.SyncConnection, source domain.SessionSource, activities []domain.ExternalActivity) (*ImportResult, error) {
	result := &ImportResult{Fetched: len(activities), Errors: []string{}}
	today := s.clock.Today()

	candidates := make([]*domain.Session, 0, len(activities))
	from, to := "", ""
	for _, act := range activities {
		session, err := sessionFromActivity(act, today)
		if err != nil {
			result.Skipped++
			if len(result.Errors) < maxIngestErrors {
				result.Errors = append(result.Errors, fmt.Sprintf("%s %s: %s", act.PerformedOn, act.Title, userText(err)))
			}
			continue
		}
		session.UserID = conn.UserID
		session.Source = source
		session.ConnectionID = &conn.ID
		candidates = append(candidates, session)
		if from == "" || session.PerformedOn < from {
			from = session.PerformedOn
		}
		if session.PerformedOn > to {
			to = session.PerformedOn
		}
	}
	if len(candidates) == 0 {
		return result, nil
	}

	existing, err := s.sessions.List(ctx, conn.UserID, from, to)
	if err != nil {
		return nil, err
	}
	for _, c := range candidates {
		if hasDuplicate(existing, c) {
			result.Duplicates++
			continue
		}
		inserted, err := s.sessions.InsertExternal(ctx, c)
		if err != nil {
			return nil, err
		}
		if !inserted {
			result.Duplicates++
			continue
		}
		result.Saved++
		existing = append(existing, *c)
	}
	return result, nil
}

func hasDuplicate(existing []domain.Session, c *domain.Session) bool {
	for i := range existing {
		if IsDuplicate(&existing[i], c) {
			return true
		}
	}
	return false
}

// IsDuplicate 는 c 가 이미 있는 기록 e 와 같은 운동인지 본다.
//   - 같은 연결에서 온 기록끼리는 활동 id 로만 가린다 (하루에 두 번 달린 건 서로 다른 기록이다)
//   - 출처가 다르면 같은 날 · 같은 종류에 거리(±3%) · 시간(±5%)이 비슷하면 같은 운동으로 본다.
//     비교할 값이 없으면(웨이트처럼) 같은 날 같은 종류를 같은 운동으로 본다
func IsDuplicate(e, c *domain.Session) bool {
	if e.ExternalID != "" && e.Source == c.Source && e.ExternalID == c.ExternalID {
		return true
	}
	if e.ExternalID != "" && e.Source == c.Source && sameConnection(e.ConnectionID, c.ConnectionID) {
		return false
	}
	if e.PerformedOn != c.PerformedOn || e.Kind != c.Kind {
		return false
	}
	switch {
	case e.DistanceKm != nil && c.DistanceKm != nil:
		if !near(*e.DistanceKm, *c.DistanceKm, 0.03, 0.1) {
			return false
		}
		return e.DurationSec == nil || c.DurationSec == nil || near(float64(*e.DurationSec), float64(*c.DurationSec), 0.05, 60)
	case e.DurationSec != nil && c.DurationSec != nil:
		return near(float64(*e.DurationSec), float64(*c.DurationSec), 0.1, 120)
	default:
		return true
	}
}

func sameConnection(a, b *string) bool {
	return a != nil && b != nil && *a == *b
}

// near 는 두 값의 차이가 비율(ratio) 또는 절대값(abs) 안인지 본다.
func near(a, b, ratio, abs float64) bool {
	diff := math.Abs(a - b)
	return diff <= abs || diff <= ratio*math.Max(math.Abs(a), math.Abs(b))
}
