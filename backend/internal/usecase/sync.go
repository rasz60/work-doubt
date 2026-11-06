package usecase

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/google/uuid"
)

const (
	maxIngestWorkouts  = 200
	maxIngestErrors    = 5
	appleHealthAccount = "apple_health" // Apple 건강 연결은 사용자마다 하나라 계정 id 를 고정한다
)

// Sync 는 Apple 건강 연동을 다룬다: iPhone 앱이 HealthKit 에서 운동을 읽어 로그인 토큰으로 보낸다.
type Sync struct {
	conns    domain.SyncConnectionRepository
	sessions domain.SessionRepository
	clock    *Clock
}

func NewSync(conns domain.SyncConnectionRepository, sessions domain.SessionRepository, clock *Clock) *Sync {
	return &Sync{conns: conns, sessions: sessions, clock: clock}
}

func (s *Sync) Connections(ctx context.Context, userID string) ([]domain.SyncConnection, error) {
	return s.conns.List(ctx, userID)
}

// Disconnect 는 연결을 지운다. 받은 기록은 남는다 (connection_id 만 비워진다).
func (s *Sync) Disconnect(ctx context.Context, userID, id string) error {
	if _, err := s.conns.Find(ctx, userID, id); err != nil {
		return err
	}
	return s.conns.Delete(ctx, userID, id)
}

func sessionFromActivity(act domain.ExternalActivity, today string) (*domain.Session, error) {
	session, err := NormalizeSession(SessionInput{
		PerformedOn:  act.PerformedOn,
		Kind:         act.Kind,
		Title:        act.Title,
		DistanceKm:   act.DistanceKm,
		DurationSec:  act.DurationSec,
		CaloriesKcal: act.CaloriesKcal,
		AvgHeartRate: act.AvgHeartRate,
	}, today)
	if err != nil {
		return nil, err
	}
	session.ID = uuid.NewString()
	session.ExternalID = act.ExternalID
	return session, nil
}

// IngestWorkout 은 iPhone 앱이 HealthKit 에서 읽어 보낸 운동 하나다. 여러 단위를 받는다.
type IngestWorkout struct {
	ID           string // HealthKit 쪽 고유 id. 없으면 날짜 · 종류 · 거리 · 시간으로 만든다 (같은 기록을 다시 보내도 한 번만 들어간다)
	Date         string // YYYY-MM-DD
	Start        string // 시작 시각 (RFC3339 등). Date 가 없으면 이것의 날짜
	Type         string // running · 러닝 · strength … (러닝 / 웨이트 / 기타로 나눈다)
	Title        string
	DistanceKm   *float64
	DistanceM    *float64
	DurationSec  *float64
	DurationMin  *float64
	CaloriesKcal *float64
	AvgHeartRate *float64
}

type IngestResult struct {
	Connection string `json:"connection"`
	ImportResult
}

// AppleHealth 는 iPhone 앱이 HealthKit 에서 읽은 운동을 저장한다. 연결이 없으면 만든다.
// 처음 연결할 때는 최근 운동이 없을 수도 있어 빈 목록도 받는다 (연결만 만든다).
func (s *Sync) AppleHealth(ctx context.Context, userID string, workouts []IngestWorkout) (*IngestResult, error) {
	conn := &domain.SyncConnection{
		ID:                uuid.NewString(),
		UserID:            userID,
		Provider:          domain.ProviderAppleHealth,
		Name:              "Apple 건강",
		ExternalAccountID: appleHealthAccount,
	}
	if err := s.conns.Save(ctx, conn); err != nil {
		return nil, err
	}
	return s.receive(ctx, conn, domain.SourceAppleHealth, workouts)
}

// receive 는 폰이 보낸 운동 기록을 저장하고 결과를 연결에 남긴다. 이미 있는 기록은 건너뛴다.
func (s *Sync) receive(ctx context.Context, conn *domain.SyncConnection, source domain.SessionSource, workouts []IngestWorkout) (*IngestResult, error) {
	if len(workouts) > maxIngestWorkouts {
		return nil, invalid("한 번에 %d개까지 보낼 수 있습니다", maxIngestWorkouts)
	}

	activities := make([]domain.ExternalActivity, 0, len(workouts))
	var rejected []string
	for i, w := range workouts {
		act, err := s.activityFromIngest(w)
		if err != nil {
			rejected = append(rejected, fmt.Sprintf("%d번째: %s", i+1, userText(err)))
			continue
		}
		activities = append(activities, act)
	}

	result, err := s.importActivities(ctx, conn, source, activities)
	if err != nil {
		return nil, err
	}
	result.Fetched = len(workouts)
	result.Skipped += len(rejected)
	result.Errors = append(rejected, result.Errors...)
	if len(result.Errors) > maxIngestErrors {
		result.Errors = result.Errors[:maxIngestErrors]
	}

	syncErr := ""
	if len(workouts) > 0 && result.Saved == 0 && result.Duplicates == 0 {
		syncErr = "받은 기록을 하나도 저장하지 못했습니다"
	}
	if err := s.conns.MarkSynced(ctx, conn.ID, s.clock.Now(), syncErr); err != nil {
		return nil, err
	}
	return &IngestResult{Connection: conn.Name, ImportResult: *result}, nil
}

func (s *Sync) activityFromIngest(w IngestWorkout) (domain.ExternalActivity, error) {
	date, err := s.ingestDate(w)
	if err != nil {
		return domain.ExternalActivity{}, err
	}
	kind := KindFromType(w.Type)

	var distance *float64
	switch {
	case w.DistanceKm != nil:
		distance = w.DistanceKm
	case w.DistanceM != nil:
		km := *w.DistanceM / 1000
		distance = &km
	}
	if distance != nil {
		km := round2(*distance)
		distance = &km
	}
	var duration *int
	switch {
	case w.DurationSec != nil:
		duration = roundInt(*w.DurationSec)
	case w.DurationMin != nil:
		duration = roundInt(*w.DurationMin * 60)
	}
	var kcal, hr *int
	if w.CaloriesKcal != nil {
		kcal = roundInt(*w.CaloriesKcal)
	}
	if w.AvgHeartRate != nil {
		hr = roundInt(*w.AvgHeartRate)
	}

	externalID := strings.TrimSpace(w.ID)
	if len(externalID) > 200 {
		return domain.ExternalActivity{}, invalid("id 는 200자 이하로 보내세요")
	}
	if externalID == "" {
		externalID = derivedID(date, w.Start, kind, distance, duration)
	}

	return domain.ExternalActivity{
		ExternalID:   externalID,
		Title:        w.Title,
		Kind:         kind,
		PerformedOn:  date,
		DistanceKm:   distance,
		DurationSec:  duration,
		CaloriesKcal: kcal,
		AvgHeartRate: hr,
	}, nil
}

// ingestDate 는 date(YYYY-MM-DD) 를 먼저 보고, 없으면 start 시각의 날짜(시각에 붙은 시간대 기준)를 쓴다.
func (s *Sync) ingestDate(w IngestWorkout) (string, error) {
	if d := strings.TrimSpace(w.Date); d != "" {
		if len(d) >= 10 {
			if t, err := time.Parse(domain.DateLayout, d[:10]); err == nil {
				return formatDay(t), nil
			}
		}
		return "", invalid("date 형식이 올바르지 않습니다 (YYYY-MM-DD)")
	}
	start := strings.TrimSpace(w.Start)
	if start == "" {
		return "", invalid("date 나 start 중 하나는 보내세요")
	}
	if t, err := time.Parse(time.RFC3339, start); err == nil {
		return formatDay(t), nil
	}
	for _, layout := range []string{"2006-01-02T15:04:05", "2006-01-02 15:04:05", "2006-01-02 15:04"} {
		if t, err := time.ParseInLocation(layout, start, s.clock.Location()); err == nil {
			return formatDay(t), nil
		}
	}
	return "", invalid("start 형식이 올바르지 않습니다 (예: 2026-10-21T07:00:00+09:00)")
}

// KindFromType 은 기기 · 앱이 쓰는 운동 이름을 러닝 / 웨이트 / 기타로 나눈다.
func KindFromType(t string) domain.WorkoutKind {
	t = strings.ToLower(t)
	for _, word := range []string{"run", "jog", "러닝", "달리기", "조깅"} {
		if strings.Contains(t, word) {
			return domain.KindRun
		}
	}
	for _, word := range []string{"strength", "weight", "웨이트", "근력", "헬스"} {
		if strings.Contains(t, word) {
			return domain.KindWeight
		}
	}
	return domain.KindOther
}

func derivedID(date, start string, kind domain.WorkoutKind, distance *float64, duration *int) string {
	km, sec := 0.0, 0
	if distance != nil {
		km = *distance
	}
	if duration != nil {
		sec = *duration
	}
	sum := sha1.Sum(fmt.Appendf(nil, "%s|%s|%s|%.2f|%d", date, strings.TrimSpace(start), kind, km, sec))
	return "auto-" + hex.EncodeToString(sum[:])
}

func roundInt(v float64) *int {
	n := int(math.Round(v))
	return &n
}

// userText 는 ErrInvalidInput 으로 감싼 한국어 메시지에서 센티널 꼬리를 뗀다.
func userText(err error) string {
	return strings.TrimSuffix(err.Error(), ": "+domain.ErrInvalidInput.Error())
}
