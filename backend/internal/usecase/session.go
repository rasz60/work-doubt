package usecase

import (
	"context"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/google/uuid"
)

const (
	maxSessionSets   = 100
	maxListRangeDays = 400
)

// Session 은 일자별 운동 수행 기록(러닝: 거리 · 시간 / 웨이트: 종목 · 중량 · 횟수)을 다룬다.
type Session struct {
	sessions domain.SessionRepository
	clock    *Clock
}

func NewSession(sessions domain.SessionRepository, clock *Clock) *Session {
	return &Session{sessions: sessions, clock: clock}
}

type SessionInput struct {
	PerformedOn  string
	Kind         domain.WorkoutKind
	Title        string
	DistanceKm   *float64
	DurationSec  *int
	CaloriesKcal *int
	AvgHeartRate *int
	Memo         string
	Sets         []domain.SessionSet
}

func (s *Session) Create(ctx context.Context, userID string, in SessionInput) (*domain.Session, error) {
	session, err := NormalizeSession(in, s.clock.Today())
	if err != nil {
		return nil, err
	}
	session.ID = uuid.NewString()
	session.UserID = userID
	session.Source = domain.SourceManual
	if err := s.sessions.Create(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

// Update 는 연동으로 들어온 기록도 고칠 수 있다(메모 · 세트 추가 등). 출처는 바뀌지 않는다.
func (s *Session) Update(ctx context.Context, userID, id string, in SessionInput) (*domain.Session, error) {
	current, err := s.sessions.Find(ctx, userID, id)
	if err != nil {
		return nil, err
	}
	session, err := NormalizeSession(in, s.clock.Today())
	if err != nil {
		return nil, err
	}
	session.ID = current.ID
	session.UserID = userID
	session.Source = current.Source
	session.ConnectionID = current.ConnectionID
	session.CreatedAt = current.CreatedAt
	if err := s.sessions.Update(ctx, session); err != nil {
		return nil, err
	}
	return session, nil
}

func (s *Session) Delete(ctx context.Context, userID, id string) error {
	return s.sessions.Delete(ctx, userID, id)
}

// List 는 [from, to] 의 기록이다. 비우면 최근 2주.
func (s *Session) List(ctx context.Context, userID, from, to string) ([]domain.Session, error) {
	start, end, err := dayRange(from, to, s.clock.Today(), 13)
	if err != nil {
		return nil, err
	}
	return s.sessions.List(ctx, userID, formatDay(start), formatDay(end))
}

// dayRange 는 빈 값을 today 와 today-defaultDays 로 채우고 범위를 검사한다.
func dayRange(from, to, today string, defaultDays int) (time.Time, time.Time, error) {
	if to == "" {
		to = today
	}
	end, err := parseDay(to, "끝")
	if err != nil {
		return time.Time{}, time.Time{}, err
	}
	start := end.AddDate(0, 0, -defaultDays)
	if from != "" {
		if start, err = parseDay(from, "시작"); err != nil {
			return time.Time{}, time.Time{}, err
		}
	}
	if start.After(end) {
		return time.Time{}, time.Time{}, invalid("시작 날짜가 끝 날짜보다 늦습니다")
	}
	if end.Sub(start) > maxListRangeDays*24*time.Hour {
		return time.Time{}, time.Time{}, invalid("한 번에 %d일까지만 조회할 수 있습니다", maxListRangeDays)
	}
	return start, end, nil
}

// NormalizeSession 은 입력을 검사하고 종류에 맞지 않는 값을 지운다. today 는 사용자 현지 날짜(YYYY-MM-DD).
func NormalizeSession(in SessionInput, today string) (*domain.Session, error) {
	day, err := parseDay(in.PerformedOn, "운동한")
	if err != nil {
		return nil, err
	}
	if limit, err := parseDay(today, "오늘"); err == nil && day.After(limit.AddDate(0, 0, 1)) {
		return nil, invalid("아직 오지 않은 날짜에는 기록할 수 없습니다")
	}

	title, err := trimMax(in.Title, 100, "제목")
	if err != nil {
		return nil, err
	}
	memo, err := trimMax(in.Memo, 1000, "메모")
	if err != nil {
		return nil, err
	}

	s := &domain.Session{
		PerformedOn:  formatDay(day),
		Kind:         in.Kind,
		Title:        title,
		DistanceKm:   positive(in.DistanceKm),
		DurationSec:  positive(in.DurationSec),
		CaloriesKcal: positive(in.CaloriesKcal),
		AvgHeartRate: positive(in.AvgHeartRate),
		Memo:         memo,
		Sets:         []domain.SessionSet{},
	}

	switch s.Kind {
	case domain.KindRun, domain.KindOther:
	case domain.KindWeight:
		s.DistanceKm = nil
		if len(in.Sets) > maxSessionSets {
			return nil, invalid("세트는 %d개까지 기록할 수 있습니다", maxSessionSets)
		}
		for _, set := range in.Sets {
			name, err := trimMax(set.Exercise, 60, "종목 이름")
			if err != nil {
				return nil, err
			}
			if name == "" {
				continue
			}
			set.Exercise = name
			set.WeightKg = positive(set.WeightKg)
			if err := checkInt(&set.Reps, 1, 999, name+" 횟수"); err != nil {
				return nil, err
			}
			if err := checkFloat(set.WeightKg, 0, 999, name+" 중량(kg)"); err != nil {
				return nil, err
			}
			s.Sets = append(s.Sets, set)
		}
	default:
		return nil, invalid("운동 종류는 러닝 · 웨이트 · 기타 중 하나입니다")
	}

	if err := checkFloat(s.DistanceKm, 0.01, 500, "거리(km)"); err != nil {
		return nil, err
	}
	if err := checkInt(s.DurationSec, 1, 172800, "운동 시간(초)"); err != nil {
		return nil, err
	}
	if err := checkInt(s.CaloriesKcal, 1, 19999, "소비 칼로리(kcal)"); err != nil {
		return nil, err
	}
	if err := checkInt(s.AvgHeartRate, 30, 250, "평균 심박수"); err != nil {
		return nil, err
	}

	switch {
	case s.Kind == domain.KindRun && s.DistanceKm == nil && s.DurationSec == nil:
		return nil, invalid("러닝은 거리나 시간 중 하나는 입력하세요")
	case s.Kind == domain.KindWeight && len(s.Sets) == 0 && s.DurationSec == nil:
		return nil, invalid("웨이트는 세트(종목 · 횟수)나 운동 시간 중 하나는 입력하세요")
	case s.Kind == domain.KindOther && s.DurationSec == nil && s.DistanceKm == nil && s.CaloriesKcal == nil:
		return nil, invalid("시간 · 거리 · 칼로리 중 하나는 입력하세요")
	}

	if s.Title == "" {
		s.Title = defaultTitle(s.Kind)
	}
	return s, nil
}

func defaultTitle(kind domain.WorkoutKind) string {
	switch kind {
	case domain.KindRun:
		return "러닝"
	case domain.KindWeight:
		return "웨이트"
	default:
		return "운동"
	}
}

// Clock 은 사용자 현지 날짜(오늘)를 정한다. 서버 시간대가 아니라 설정한 시간대(기본 Asia/Seoul) 기준이다.
type Clock struct {
	loc *time.Location
	now func() time.Time
}

func NewClock(loc *time.Location) *Clock {
	if loc == nil {
		loc = time.UTC
	}
	return &Clock{loc: loc, now: time.Now}
}

func (c *Clock) Now() time.Time { return c.now().In(c.loc) }

func (c *Clock) Today() string { return c.Now().Format(domain.DateLayout) }

// Location 은 시각 없이 들어온 날짜 · 시각을 읽을 때 쓰는 시간대다.
func (c *Clock) Location() *time.Location { return c.loc }
