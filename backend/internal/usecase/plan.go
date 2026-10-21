package usecase

import (
	"context"
	"strings"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/google/uuid"
)

const (
	maxPlanExercises = 30
	maxPlanVersions  = 200
)

// Plan 은 주간 운동 계획(루틴)의 버전을 다룬다. 고칠 때마다 새 버전이 쌓인다(이력).
type Plan struct {
	plans domain.PlanRepository
}

func NewPlan(plans domain.PlanRepository) *Plan {
	return &Plan{plans: plans}
}

type SavePlanInput struct {
	EffectiveFrom string
	Title         string
	Days          []domain.PlanDay
}

// Save 는 EffectiveFrom 부터 적용할 계획을 저장한다. 같은 날짜의 버전이 있으면 덮어쓴다.
func (p *Plan) Save(ctx context.Context, userID string, in SavePlanInput) (*domain.Plan, error) {
	from, err := parseDay(in.EffectiveFrom, "적용 시작일")
	if err != nil {
		return nil, err
	}
	title, err := trimMax(in.Title, 60, "계획 이름")
	if err != nil {
		return nil, err
	}
	days, err := NormalizePlanDays(in.Days)
	if err != nil {
		return nil, err
	}

	plan := &domain.Plan{
		ID:            uuid.NewString(),
		UserID:        userID,
		EffectiveFrom: formatDay(from),
		Title:         title,
		Days:          days,
	}
	if err := p.plans.Save(ctx, plan); err != nil {
		return nil, err
	}
	return plan, nil
}

func (p *Plan) List(ctx context.Context, userID string) ([]domain.Plan, error) {
	return p.plans.List(ctx, userID, maxPlanVersions)
}

func (p *Plan) Delete(ctx context.Context, userID, id string) error {
	return p.plans.Delete(ctx, userID, id)
}

// NormalizePlanDays 는 요일 7개(월~일)를 빠짐없이 요일 순으로 맞추고, 종류에 맞지 않는 값은 지운다.
// 보내지 않은 요일은 쉬는 날이다.
func NormalizePlanDays(in []domain.PlanDay) ([]domain.PlanDay, error) {
	byWeekday := make(map[int]domain.PlanDay, 7)
	for _, d := range in {
		if d.Weekday < 1 || d.Weekday > 7 {
			return nil, invalid("요일 값이 올바르지 않습니다 (1=월 … 7=일)")
		}
		if _, dup := byWeekday[d.Weekday]; dup {
			return nil, invalid("같은 요일이 두 번 들어 있습니다")
		}
		byWeekday[d.Weekday] = d
	}

	days := make([]domain.PlanDay, 0, 7)
	for weekday := 1; weekday <= 7; weekday++ {
		d, ok := byWeekday[weekday]
		if !ok || d.Kind == "" {
			d = domain.PlanDay{Weekday: weekday, Kind: domain.KindRest}
		}
		normalized, err := normalizePlanDay(d)
		if err != nil {
			return nil, err
		}
		days = append(days, normalized)
	}
	return days, nil
}

func normalizePlanDay(d domain.PlanDay) (domain.PlanDay, error) {
	out := domain.PlanDay{Weekday: d.Weekday, Kind: d.Kind}

	switch d.Kind {
	case domain.KindRest:
		return out, nil
	case domain.KindRun:
		out.DistanceKm = positive(d.DistanceKm)
		out.PaceSecPerKm = positive(d.PaceSecPerKm)
		if err := checkFloat(out.DistanceKm, 0.1, 200, "목표 거리(km)"); err != nil {
			return out, err
		}
		if err := checkInt(out.PaceSecPerKm, 120, 1800, "목표 페이스(초/km)"); err != nil {
			return out, err
		}
	case domain.KindWeight:
		if len(d.Exercises) > maxPlanExercises {
			return out, invalid("루틴 종목은 %d개까지 넣을 수 있습니다", maxPlanExercises)
		}
		for _, ex := range d.Exercises {
			name, err := trimMax(ex.Name, 60, "종목 이름")
			if err != nil {
				return out, err
			}
			if name == "" {
				continue // 빈 줄은 버린다
			}
			ex.Name = name
			ex.WeightKg = positive(ex.WeightKg)
			if err := checkInt(&ex.Sets, 1, 20, name+" 세트 수"); err != nil {
				return out, err
			}
			if err := checkInt(&ex.Reps, 1, 200, name+" 횟수"); err != nil {
				return out, err
			}
			if err := checkFloat(ex.WeightKg, 0, 999, name+" 중량(kg)"); err != nil {
				return out, err
			}
			out.Exercises = append(out.Exercises, ex)
		}
	default:
		return out, invalid("계획의 운동 종류는 러닝 · 웨이트 · 휴식 중 하나입니다")
	}

	out.TargetKcal = positive(d.TargetKcal)
	if err := checkInt(out.TargetKcal, 1, 10000, "목표 소비 칼로리(kcal)"); err != nil {
		return out, err
	}
	return out, nil
}

// PlanFor 는 date(YYYY-MM-DD)에 적용되는 계획 버전이다. plans 는 effective_from 내림차순이어야 한다.
// YYYY-MM-DD 는 문자열 순서가 날짜 순서와 같다.
func PlanFor(plans []domain.Plan, date string) *domain.Plan {
	for i := range plans {
		if strings.Compare(plans[i].EffectiveFrom, date) <= 0 {
			return &plans[i]
		}
	}
	return nil
}

// PlanDayFor 는 date 의 요일 계획이다. 계획이 없거나 쉬는 날이면 nil.
func PlanDayFor(plans []domain.Plan, date string) *domain.PlanDay {
	plan := PlanFor(plans, date)
	if plan == nil {
		return nil
	}
	day, err := parseDay(date, "날짜")
	if err != nil {
		return nil
	}
	weekday := isoWeekday(day)
	for i := range plan.Days {
		if plan.Days[i].Weekday == weekday && plan.Days[i].Kind != domain.KindRest {
			return &plan.Days[i]
		}
	}
	return nil
}
