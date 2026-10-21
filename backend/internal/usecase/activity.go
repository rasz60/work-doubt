package usecase

import (
	"context"
	"errors"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
)

// 칼로리 추정에 쓰는 값. 기기가 칼로리를 주지 않은 기록과 계획의 목표를 이것으로 추정한다.
const (
	defaultBodyWeightKg = 70.0 // 체중 기록이 없을 때
	runKcalPerKgKm      = 1.0  // 러닝: 체중(kg) × 거리(km) × 1.0 kcal
	metRun              = 9.8  // 거리 없이 시간만 있는 러닝
	metWeight           = 5.0  // 웨이트
	metOther            = 4.0  // 기타
	minutesPerSet       = 3.0  // 웨이트 1세트 (휴식 포함)
	statsWindowDays     = 30   // 러닝 평균 · 최고 기록을 보는 기간
	seriesWindowDays    = 182  // 수행 능력 그래프 기간 (약 6개월)
	maxExerciseStats    = 12
	maxCalendarDays     = 400
)

// Activity 는 메인 화면의 잔디(계획 대비 수행)와 통계(칼로리 · 러닝 · 웨이트 수행 능력)를 만든다.
type Activity struct {
	plans    domain.PlanRepository
	sessions domain.SessionRepository
	metrics  domain.BodyMetricRepository
	clock    *Clock
}

func NewActivity(plans domain.PlanRepository, sessions domain.SessionRepository, metrics domain.BodyMetricRepository, clock *Clock) *Activity {
	return &Activity{plans: plans, sessions: sessions, metrics: metrics, clock: clock}
}

// Calendar 는 [from, to] 의 잔디다.
func (a *Activity) Calendar(ctx context.Context, userID, from, to string) ([]domain.CalendarDay, error) {
	today := a.clock.Today()
	start, end, err := dayRange(from, to, today, 27)
	if err != nil {
		return nil, err
	}
	if end.Sub(start) > maxCalendarDays*24*time.Hour {
		return nil, invalid("한 번에 %d일까지만 조회할 수 있습니다", maxCalendarDays)
	}

	plans, err := a.plans.List(ctx, userID, maxPlanVersions)
	if err != nil {
		return nil, err
	}
	sessions, err := a.sessions.List(ctx, userID, formatDay(start), formatDay(end))
	if err != nil {
		return nil, err
	}
	return BuildCalendar(plans, sessions, start, end, today), nil
}

// Summary 는 month(YYYY-MM, 비우면 이번 달)의 칼로리와 최근 수행 능력이다.
func (a *Activity) Summary(ctx context.Context, userID, month string) (*domain.ActivitySummary, error) {
	today := a.clock.Today()
	todayDay, _ := parseDay(today, "오늘")
	if month == "" {
		month = today[:7]
	}
	monthStart, err := time.Parse("2006-01", month)
	if err != nil {
		return nil, invalid("월 형식이 올바르지 않습니다 (YYYY-MM)")
	}
	monthEnd := monthStart.AddDate(0, 1, -1)

	// 이번 달과 그래프 기간(최근 6개월)을 한 번에 읽는다
	from := todayDay.AddDate(0, 0, -seriesWindowDays)
	if monthStart.Before(from) {
		from = monthStart
	}
	to := monthEnd
	if todayDay.After(to) {
		to = todayDay
	}
	if to.Sub(from) > 3*maxListRangeDays*24*time.Hour {
		return nil, invalid("너무 오래전 달입니다")
	}

	plans, err := a.plans.List(ctx, userID, maxPlanVersions)
	if err != nil {
		return nil, err
	}
	sessions, err := a.sessions.List(ctx, userID, formatDay(from), formatDay(to))
	if err != nil {
		return nil, err
	}
	bodyKg, assumed, err := a.bodyWeight(ctx, userID)
	if err != nil {
		return nil, err
	}

	summary := BuildSummary(plans, sessions, monthStart, monthEnd, todayDay, bodyKg)
	summary.WeightAssumed = assumed
	return summary, nil
}

func (a *Activity) bodyWeight(ctx context.Context, userID string) (float64, bool, error) {
	latest, err := a.metrics.Latest(ctx, userID)
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return 0, false, err
	}
	if latest == nil || latest.WeightKg == nil || *latest.WeightKg <= 0 {
		return defaultBodyWeightKg, true, nil
	}
	return *latest.WeightKg, false, nil
}

// ── 잔디 ─────────────────────────────────────────────

// BuildCalendar 는 날짜마다 그날 적용되던 계획과 기록을 맞춰 본다. plans 는 effective_from 내림차순이다.
func BuildCalendar(plans []domain.Plan, sessions []domain.Session, start, end time.Time, today string) []domain.CalendarDay {
	byDate := groupByDate(sessions)

	days := make([]domain.CalendarDay, 0, int(end.Sub(start).Hours()/24)+1)
	for d := start; !d.After(end); d = d.AddDate(0, 0, 1) {
		date := formatDay(d)
		planned := PlanDayFor(plans, date)
		done := byDate[date]
		if done == nil {
			done = []domain.Session{}
		}
		status, achievement, level := Score(planned, done, strings.Compare(date, today) < 0)
		days = append(days, domain.CalendarDay{
			Date:        date,
			Weekday:     isoWeekday(d),
			Planned:     planned,
			Sessions:    done,
			Status:      status,
			Achievement: achievement,
			Level:       level,
		})
	}
	return days
}

// Score 는 하루의 계획 대비 수행을 채점한다.
//   - 러닝: 목표 거리가 있으면 달린 거리 / 목표 거리, 없으면 달렸으면 채움
//   - 웨이트: 계획 세트 수가 있으면 한 세트 수 / 계획 세트 수, 세트를 안 적었으면(연동 기록) 채움
//   - 계획과 다른 운동만 했으면 일부(0.3)
func Score(planned *domain.PlanDay, sessions []domain.Session, past bool) (domain.DayStatus, float64, int) {
	if planned == nil {
		if len(sessions) == 0 {
			return domain.StatusRest, 0, 0
		}
		return domain.StatusExtra, 1, 3
	}
	if len(sessions) == 0 {
		if past {
			return domain.StatusMissed, 0, 0
		}
		return domain.StatusPlanned, 0, 0
	}

	var ratio float64
	switch planned.Kind {
	case domain.KindRun:
		var km float64
		ran := false
		for _, s := range sessions {
			if s.Kind != domain.KindRun {
				continue
			}
			ran = true
			km += runDistance(s, planned.PaceSecPerKm)
		}
		switch {
		case !ran:
		case planned.DistanceKm != nil && *planned.DistanceKm > 0:
			ratio = km / *planned.DistanceKm
		default:
			ratio = 1
		}
	case domain.KindWeight:
		plannedSets := 0
		for _, ex := range planned.Exercises {
			plannedSets += ex.Sets
		}
		lifted, doneSets := false, 0
		for _, s := range sessions {
			if s.Kind != domain.KindWeight {
				continue
			}
			lifted = true
			doneSets += len(s.Sets)
		}
		switch {
		case !lifted:
		case plannedSets == 0 || doneSets == 0:
			ratio = 1
		default:
			ratio = float64(doneSets) / float64(plannedSets)
		}
	}

	if ratio == 0 {
		ratio = 0.3 // 계획과 다른 운동을 했다
	}
	ratio = math.Min(ratio, 1)
	switch {
	case ratio >= 0.95:
		return domain.StatusDone, 1, 4
	case ratio >= 0.66:
		return domain.StatusPartial, round2(ratio), 3
	case ratio >= 0.33:
		return domain.StatusPartial, round2(ratio), 2
	default:
		return domain.StatusPartial, round2(ratio), 1
	}
}

// runDistance 는 거리 없이 시간만 적은 러닝을 목표 페이스로 거리로 바꿔 센다.
func runDistance(s domain.Session, paceSecPerKm *int) float64 {
	if s.DistanceKm != nil {
		return *s.DistanceKm
	}
	if s.DurationSec != nil && paceSecPerKm != nil && *paceSecPerKm > 0 {
		return float64(*s.DurationSec) / float64(*paceSecPerKm)
	}
	return 0
}

func groupByDate(sessions []domain.Session) map[string][]domain.Session {
	byDate := make(map[string][]domain.Session, len(sessions))
	for _, s := range sessions {
		byDate[s.PerformedOn] = append(byDate[s.PerformedOn], s)
	}
	return byDate
}

// ── 칼로리 ─────────────────────────────────────────────

// SessionKcal 은 기록의 소비 칼로리다. 기기 · 사용자가 준 값이 없으면 체중으로 추정한다.
func SessionKcal(s domain.Session, bodyKg float64) int {
	if s.CaloriesKcal != nil {
		return *s.CaloriesKcal
	}
	hours := 0.0
	if s.DurationSec != nil {
		hours = float64(*s.DurationSec) / 3600
	}
	switch s.Kind {
	case domain.KindRun:
		if s.DistanceKm != nil {
			return int(math.Round(bodyKg * *s.DistanceKm * runKcalPerKgKm))
		}
		return int(math.Round(metRun * bodyKg * hours))
	case domain.KindWeight:
		if hours == 0 {
			hours = float64(len(s.Sets)) * minutesPerSet / 60
		}
		return int(math.Round(metWeight * bodyKg * hours))
	default:
		return int(math.Round(metOther * bodyKg * hours))
	}
}

// PlannedKcal 은 계획한 날의 목표 소비 칼로리다. 직접 정한 목표가 없으면 계획으로 추정한다.
func PlannedKcal(d *domain.PlanDay, bodyKg float64) int {
	if d == nil {
		return 0
	}
	if d.TargetKcal != nil {
		return *d.TargetKcal
	}
	switch d.Kind {
	case domain.KindRun:
		if d.DistanceKm != nil {
			return int(math.Round(bodyKg * *d.DistanceKm * runKcalPerKgKm))
		}
		return int(math.Round(metRun * bodyKg * 0.5)) // 목표 거리가 없으면 30분
	case domain.KindWeight:
		sets := 0
		for _, ex := range d.Exercises {
			sets += ex.Sets
		}
		hours := float64(sets) * minutesPerSet / 60
		if hours == 0 {
			hours = 0.75 // 루틴이 비어 있으면 45분
		}
		return int(math.Round(metWeight * bodyKg * hours))
	default:
		return 0
	}
}

// ── 수행 능력 ─────────────────────────────────────────────

// Vdot 은 Daniels-Gilbert 공식으로 한 번의 러닝에서 추정한 러닝 능력 지수다 (클수록 빠르다).
// 1km · 3분 미만 기록이나 말이 안 되는 값은 0.
func Vdot(distanceKm float64, durationSec int) float64 {
	if distanceKm < 1 || durationSec < 180 {
		return 0
	}
	minutes := float64(durationSec) / 60
	velocity := distanceKm * 1000 / minutes // m/분
	vo2 := -4.60 + 0.182258*velocity + 0.000104*velocity*velocity
	fraction := 0.8 + 0.1894393*math.Exp(-0.012778*minutes) + 0.2989558*math.Exp(-0.1932605*minutes)
	v := vo2 / fraction
	if v < 10 || v > 90 {
		return 0
	}
	return round1(v)
}

// Estimated1RM 은 Epley 공식(중량 × (1 + 횟수/30))으로 추정한 1회 최대 중량이다.
func Estimated1RM(weightKg float64, reps int) float64 {
	if weightKg <= 0 || reps <= 0 {
		return 0
	}
	if reps == 1 {
		return weightKg
	}
	return round1(weightKg * (1 + float64(reps)/30))
}

// BuildSummary 는 칼로리 · 러닝 · 웨이트 통계를 만든다. sessions 는 날짜 오름차순이다.
func BuildSummary(plans []domain.Plan, sessions []domain.Session, monthStart, monthEnd, today time.Time, bodyKg float64) *domain.ActivitySummary {
	todayStr := formatDay(today)
	summary := &domain.ActivitySummary{
		Today:          todayStr,
		Month:          monthStart.Format("2006-01"),
		BodyWeightKg:   bodyKg,
		HasAnySessions: len(sessions) > 0,
		RunSeries:      []domain.PerformanceSeries{},
		Exercises:      []domain.ExerciseStat{},
	}
	current := PlanFor(plans, todayStr)
	if current != nil {
		summary.CurrentPlanID = current.ID
	}

	// 칼로리: 오늘 · 이번 달
	byDate := groupByDate(sessions)
	summary.TodayKcal.Target = PlannedKcal(PlanDayFor(plans, todayStr), bodyKg)
	summary.TodayKcal.TargetToDate = summary.TodayKcal.Target
	for _, s := range byDate[todayStr] {
		summary.TodayKcal.Actual += SessionKcal(s, bodyKg)
	}
	for d := monthStart; !d.After(monthEnd); d = d.AddDate(0, 0, 1) {
		date := formatDay(d)
		planned := PlanDayFor(plans, date)
		target := PlannedKcal(planned, bodyKg)
		summary.MonthKcal.Target += target
		if !d.After(today) {
			summary.MonthKcal.TargetToDate += target
			if planned != nil {
				summary.PlannedDays++
				if status, _, _ := Score(planned, byDate[date], true); status == domain.StatusDone {
					summary.DoneDays++
				}
			}
		}
		for _, s := range byDate[date] {
			summary.MonthKcal.Actual += SessionKcal(s, bodyKg)
		}
	}

	seriesFrom := formatDay(today.AddDate(0, 0, -seriesWindowDays))
	statsFrom := formatDay(today.AddDate(0, 0, -statsWindowDays+1))
	var recent []domain.Session
	for _, s := range sessions {
		if s.PerformedOn >= seriesFrom && s.PerformedOn <= todayStr {
			recent = append(recent, s)
		}
	}

	summary.Run = runStats(recent, statsFrom)
	if current != nil {
		summary.Run.TargetDistance, summary.Run.TargetPaceSec = runTargets(current)
	}
	summary.RunSeries = runSeries(recent, today)
	summary.Exercises = exerciseStats(recent)
	return summary
}

func runTargets(plan *domain.Plan) (float64, int) {
	var km float64
	var pace, kmCount, paceCount int
	for _, d := range plan.Days {
		if d.Kind != domain.KindRun {
			continue
		}
		if d.DistanceKm != nil {
			km += *d.DistanceKm
			kmCount++
		}
		if d.PaceSecPerKm != nil {
			pace += *d.PaceSecPerKm
			paceCount++
		}
	}
	var avgKm float64
	var avgPace int
	if kmCount > 0 {
		avgKm = round2(km / float64(kmCount))
	}
	if paceCount > 0 {
		avgPace = pace / paceCount
	}
	return avgKm, avgPace
}

// runStats 는 statsFrom 이후 러닝의 횟수 · 평균 거리 · 평균 페이스 · 최고 페이스 · 러닝 능력 지수다.
func runStats(sessions []domain.Session, statsFrom string) domain.RunStats {
	var stats domain.RunStats
	var timedKm float64
	var timedSec int
	for _, s := range sessions {
		if s.Kind != domain.KindRun || s.PerformedOn < statsFrom {
			continue
		}
		stats.Count++
		if s.DistanceKm == nil {
			continue
		}
		stats.TotalKm += *s.DistanceKm
		if s.DurationSec == nil {
			continue
		}
		timedKm += *s.DistanceKm
		timedSec += *s.DurationSec
		if *s.DistanceKm >= 1 {
			pace := int(math.Round(float64(*s.DurationSec) / *s.DistanceKm))
			if stats.BestPaceSec == 0 || pace < stats.BestPaceSec {
				stats.BestPaceSec = pace
			}
		}
		stats.Vdot = math.Max(stats.Vdot, Vdot(*s.DistanceKm, *s.DurationSec))
	}
	if stats.Count > 0 {
		stats.AvgDistanceKm = round2(stats.TotalKm / float64(stats.Count))
	}
	if timedKm > 0 {
		stats.AvgPaceSec = int(math.Round(float64(timedSec) / timedKm))
	}
	stats.TotalKm = round2(stats.TotalKm)
	return stats
}

// runSeries 는 러닝 능력 지수(날짜별 최고) · 페이스(날짜별 평균, 초/km) · 주간 거리(km) 그래프다.
func runSeries(sessions []domain.Session, today time.Time) []domain.PerformanceSeries {
	vdotByDay := map[string]float64{}
	paceKm, paceSec := map[string]float64{}, map[string]int{}
	weekly := map[string]float64{}
	var firstRun time.Time

	for _, s := range sessions {
		if s.Kind != domain.KindRun || s.DistanceKm == nil {
			continue
		}
		day, err := parseDay(s.PerformedOn, "날짜")
		if err != nil {
			continue
		}
		if firstRun.IsZero() || day.Before(firstRun) {
			firstRun = day
		}
		weekly[formatDay(weekStart(day))] += *s.DistanceKm
		if s.DurationSec == nil {
			continue
		}
		if v := Vdot(*s.DistanceKm, *s.DurationSec); v > vdotByDay[s.PerformedOn] {
			vdotByDay[s.PerformedOn] = v
		}
		paceKm[s.PerformedOn] += *s.DistanceKm
		paceSec[s.PerformedOn] += *s.DurationSec
	}

	pace := map[string]float64{}
	for day, km := range paceKm {
		pace[day] = math.Round(float64(paceSec[day]) / km)
	}
	for day, v := range vdotByDay {
		if v == 0 {
			delete(vdotByDay, day)
		}
	}

	// 주간 거리는 처음 달린 주부터 이번 주까지 빈 주(0km)도 점으로 찍는다
	if !firstRun.IsZero() {
		for w := weekStart(firstRun); !w.After(today); w = w.AddDate(0, 0, 7) {
			if _, ok := weekly[formatDay(w)]; !ok {
				weekly[formatDay(w)] = 0
			}
		}
	}

	return []domain.PerformanceSeries{
		toSeries("vdot", vdotByDay),
		toSeries("pace_sec", pace),
		toSeries("weekly_km", weekly),
	}
}

func weekStart(day time.Time) time.Time {
	return day.AddDate(0, 0, -(isoWeekday(day) - 1))
}

func toSeries(kind string, values map[string]float64) domain.PerformanceSeries {
	points := make([]domain.MetricPoint, 0, len(values))
	for day, v := range values {
		t, err := parseDay(day, "날짜")
		if err != nil {
			continue
		}
		points = append(points, domain.MetricPoint{MeasuredAt: t, Value: round2(v)})
	}
	sort.Slice(points, func(i, j int) bool { return points[i].MeasuredAt.Before(points[j].MeasuredAt) })
	return domain.PerformanceSeries{Kind: kind, Points: points, Stats: Summarize(points)}
}

// exerciseStats 는 웨이트 종목별 최근 수행과 날짜별 추정 1RM(맨몸 종목은 최대 횟수) 그래프다.
// 종목 이름은 대소문자 · 앞뒤 공백을 무시하고 묶는다.
func exerciseStats(sessions []domain.Session) []domain.ExerciseStat {
	type daily struct {
		best      float64 // 추정 1RM, 맨몸이면 최대 횟수
		topWeight float64
		topReps   int
		sets      int
	}
	names := map[string]string{}
	byExercise := map[string]map[string]*daily{}

	for _, s := range sessions {
		if s.Kind != domain.KindWeight {
			continue
		}
		for _, set := range s.Sets {
			key := strings.ToLower(strings.TrimSpace(set.Exercise))
			if key == "" {
				continue
			}
			names[key] = strings.TrimSpace(set.Exercise) // 날짜 오름차순이라 마지막에 쓴 이름이 남는다
			if byExercise[key] == nil {
				byExercise[key] = map[string]*daily{}
			}
			d := byExercise[key][s.PerformedOn]
			if d == nil {
				d = &daily{}
				byExercise[key][s.PerformedOn] = d
			}
			d.sets++

			weight := 0.0
			if set.WeightKg != nil {
				weight = *set.WeightKg
			}
			score := Estimated1RM(weight, set.Reps)
			if weight == 0 {
				score = float64(set.Reps)
			}
			if score > d.best {
				d.best, d.topWeight, d.topReps = score, weight, set.Reps
			}
		}
	}

	stats := make([]domain.ExerciseStat, 0, len(byExercise))
	for key, days := range byExercise {
		values := make(map[string]float64, len(days))
		for day, d := range days {
			values[day] = d.best
		}
		series := toSeries(key, values).Points
		last := series[len(series)-1]
		lastDay := days[formatDay(last.MeasuredAt)]

		stat := domain.ExerciseStat{
			Name:        names[key],
			LastDate:    formatDay(last.MeasuredAt),
			TopWeightKg: lastDay.topWeight,
			TopReps:     lastDay.topReps,
			Sets:        lastDay.sets,
			Series:      series,
		}
		if lastDay.topWeight > 0 {
			stat.Estimated1RM = lastDay.best
		}
		if len(series) > 1 {
			stat.Delta1RM = round1(last.Value - series[len(series)-2].Value)
		}
		stats = append(stats, stat)
	}

	sort.Slice(stats, func(i, j int) bool {
		if stats[i].LastDate != stats[j].LastDate {
			return stats[i].LastDate > stats[j].LastDate
		}
		return stats[i].Name < stats[j].Name
	})
	if len(stats) > maxExerciseStats {
		stats = stats[:maxExerciseStats]
	}
	return stats
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }
func round2(v float64) float64 { return math.Round(v*100) / 100 }
