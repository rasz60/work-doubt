package domain

import (
	"context"
	"time"
)

// DateLayout 은 운동한 날 · 계획 시작일처럼 시각 없이 날짜만 다루는 값의 형식이다 (사용자 현지 날짜).
const DateLayout = time.DateOnly

// WorkoutKind 는 운동 종류다. 계획에는 rest(쉬는 날)도 쓴다.
type WorkoutKind string

const (
	KindRun    WorkoutKind = "run"
	KindWeight WorkoutKind = "weight"
	KindOther  WorkoutKind = "other"
	KindRest   WorkoutKind = "rest"
)

// ── 계획 ─────────────────────────────────────────────

// PlannedExercise 는 웨이트 루틴의 종목 하나다.
type PlannedExercise struct {
	Name     string   `json:"name"`
	Sets     int      `json:"sets"`
	Reps     int      `json:"reps"`
	WeightKg *float64 `json:"weight_kg,omitempty"`
}

// PlanDay 는 요일 하나의 계획이다. Weekday 는 ISO 요일(1=월 … 7=일).
type PlanDay struct {
	Weekday      int               `json:"weekday"`
	Kind         WorkoutKind       `json:"kind"`
	DistanceKm   *float64          `json:"distance_km,omitempty"`     // 러닝 목표 거리
	PaceSecPerKm *int              `json:"pace_sec_per_km,omitempty"` // 러닝 목표 페이스
	Exercises    []PlannedExercise `json:"exercises,omitempty"`       // 웨이트 루틴
	TargetKcal   *int              `json:"target_kcal,omitempty"`     // 비우면 계획으로 추정한다
}

// Plan 은 주간 루틴의 한 버전이다. EffectiveFrom 부터 다음 버전 전날까지 적용된다.
type Plan struct {
	ID            string    `json:"id"`
	UserID        string    `json:"user_id"`
	EffectiveFrom string    `json:"effective_from"` // YYYY-MM-DD
	Title         string    `json:"title"`
	Days          []PlanDay `json:"days"` // 월~일 7개, 요일 순
	CreatedAt     time.Time `json:"created_at"`
}

type PlanRepository interface {
	// Save 는 (user_id, effective_from) 기준으로 덮어쓴다.
	Save(ctx context.Context, p *Plan) error
	// List 는 effective_from 내림차순(최신 버전 먼저)이다.
	List(ctx context.Context, userID string, limit int) ([]Plan, error)
	Delete(ctx context.Context, userID, id string) error
}

// ── 수행 기록 ─────────────────────────────────────────────

type SessionSource string

const (
	SourceManual SessionSource = "manual"
	SourceStrava SessionSource = "strava"
	SourceDevice SessionSource = "device"
)

// SessionSet 은 웨이트 세트 하나다.
type SessionSet struct {
	Exercise string   `json:"exercise"`
	WeightKg *float64 `json:"weight_kg,omitempty"`
	Reps     int      `json:"reps"`
}

// Session 은 하루에 한 운동 기록이다. 하루에 여러 개 있을 수 있다.
type Session struct {
	ID           string        `json:"id"`
	UserID       string        `json:"user_id"`
	PerformedOn  string        `json:"performed_on"` // YYYY-MM-DD
	Kind         WorkoutKind   `json:"kind"`
	Title        string        `json:"title"`
	DistanceKm   *float64      `json:"distance_km,omitempty"`
	DurationSec  *int          `json:"duration_sec,omitempty"`
	CaloriesKcal *int          `json:"calories_kcal,omitempty"`
	AvgHeartRate *int          `json:"avg_heart_rate,omitempty"`
	Memo         string        `json:"memo,omitempty"`
	Source       SessionSource `json:"source"`
	ConnectionID *string       `json:"connection_id,omitempty"`
	ExternalID   string        `json:"-"`
	Sets         []SessionSet  `json:"sets"`
	CreatedAt    time.Time     `json:"created_at"`
	UpdatedAt    time.Time     `json:"updated_at"`
}

type SessionRepository interface {
	Create(ctx context.Context, s *Session) error
	// Update 는 본문과 세트를 통째로 바꾼다.
	Update(ctx context.Context, s *Session) error
	// UpsertExternal 은 연동 기록을 (user_id, source, external_id) 로 넣거나 고친다.
	// 사용자가 붙인 메모 · 세트는 건드리지 않는다. 새로 넣었으면 true.
	UpsertExternal(ctx context.Context, s *Session) (bool, error)
	Delete(ctx context.Context, userID, id string) error
	Find(ctx context.Context, userID, id string) (*Session, error)
	// List 는 [from, to] 의 기록을 세트와 함께 performed_on 오름차순으로 준다.
	List(ctx context.Context, userID, from, to string) ([]Session, error)
}

// ── 잔디 · 통계 ─────────────────────────────────────────────

// DayStatus 는 잔디 한 칸의 상태다.
type DayStatus string

const (
	StatusRest    DayStatus = "rest"    // 계획도 기록도 없음
	StatusPlanned DayStatus = "planned" // 오늘 이후의 계획 (아직 안 함)
	StatusDone    DayStatus = "done"    // 계획을 채움
	StatusPartial DayStatus = "partial" // 일부만 / 다른 운동을 함
	StatusMissed  DayStatus = "missed"  // 계획한 날이 지났는데 기록 없음
	StatusExtra   DayStatus = "extra"   // 계획 없는 날에 운동함
)

// CalendarDay 는 잔디 한 칸이다.
type CalendarDay struct {
	Date        string    `json:"date"`
	Weekday     int       `json:"weekday"`
	Planned     *PlanDay  `json:"planned,omitempty"` // 쉬는 날이면 없음
	Sessions    []Session `json:"sessions"`
	Status      DayStatus `json:"status"`
	Achievement float64   `json:"achievement"` // 0~1, 계획 대비 수행 비율
	Level       int       `json:"level"`       // 0~4, 잔디 진하기
}

// KcalSummary 는 목표 대비 소비 칼로리다.
type KcalSummary struct {
	Target       int `json:"target"`
	TargetToDate int `json:"target_to_date"` // 이번 달 목표 중 오늘까지 몫 (오늘은 Target 과 같다)
	Actual       int `json:"actual"`
}

type RunStats struct {
	Count          int     `json:"count"`
	TotalKm        float64 `json:"total_km"`
	AvgDistanceKm  float64 `json:"avg_distance_km"`
	AvgPaceSec     int     `json:"avg_pace_sec"`  // 0 이면 시간 기록이 없음
	BestPaceSec    int     `json:"best_pace_sec"` // 1km 이상 달린 기록 중
	Vdot           float64 `json:"vdot"`          // 최근 기록들 중 가장 높은 러닝 능력 지수
	TargetPaceSec  int     `json:"target_pace_sec,omitempty"`
	TargetDistance float64 `json:"target_distance_km,omitempty"`
}

// ExerciseStat 은 웨이트 종목 하나의 최근 수행이다.
type ExerciseStat struct {
	Name         string        `json:"name"`
	LastDate     string        `json:"last_date"`
	TopWeightKg  float64       `json:"top_weight_kg"`
	TopReps      int           `json:"top_reps"`
	Sets         int           `json:"sets"`
	Estimated1RM float64       `json:"estimated_1rm"`
	Delta1RM     float64       `json:"delta_1rm"` // 직전 기록 대비
	Series       []MetricPoint `json:"series"`    // 날짜별 추정 1RM
}

// PerformanceSeries 는 차트 하나(러닝 능력 지수 · 페이스 등)다. 프론트의 TrendChart 가 그대로 그린다.
type PerformanceSeries struct {
	Kind   string        `json:"kind"`
	Points []MetricPoint `json:"points"`
	Stats  SeriesStats   `json:"stats"`
}

type ActivitySummary struct {
	Today          string              `json:"today"`
	Month          string              `json:"month"` // YYYY-MM
	BodyWeightKg   float64             `json:"body_weight_kg"`
	WeightAssumed  bool                `json:"weight_assumed"` // 체중 기록이 없어 기본값으로 칼로리를 추정함
	TodayKcal      KcalSummary         `json:"today_kcal"`
	MonthKcal      KcalSummary         `json:"month_kcal"`
	PlannedDays    int                 `json:"planned_days"` // 이번 달 오늘까지 계획한 날
	DoneDays       int                 `json:"done_days"`    // 그중 채운 날
	Run            RunStats            `json:"run"`
	RunSeries      []PerformanceSeries `json:"run_series"`
	Exercises      []ExerciseStat      `json:"exercises"`
	CurrentPlanID  string              `json:"current_plan_id,omitempty"`
	HasAnySessions bool                `json:"has_any_sessions"`
}
