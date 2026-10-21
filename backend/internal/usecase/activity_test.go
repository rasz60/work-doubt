package usecase

import (
	"errors"
	"math"
	"testing"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
)

func f64(v float64) *float64 { return &v }
func iptr(v int) *int        { return &v }

func day(s string) time.Time {
	t, err := time.Parse(domain.DateLayout, s)
	if err != nil {
		panic(err)
	}
	return t
}

// 월/수/금 러닝 5km, 토 웨이트(스쿼트 5세트 + 벤치 5세트)
func weeklyPlan(effectiveFrom string) domain.Plan {
	run := func(w int) domain.PlanDay {
		return domain.PlanDay{Weekday: w, Kind: domain.KindRun, DistanceKm: f64(5), PaceSecPerKm: iptr(330)}
	}
	days, err := NormalizePlanDays([]domain.PlanDay{
		run(1), run(3), run(5),
		{Weekday: 6, Kind: domain.KindWeight, Exercises: []domain.PlannedExercise{
			{Name: "스쿼트", Sets: 5, Reps: 5, WeightKg: f64(80)},
			{Name: "벤치프레스", Sets: 5, Reps: 5, WeightKg: f64(60)},
		}},
	})
	if err != nil {
		panic(err)
	}
	return domain.Plan{ID: "plan-" + effectiveFrom, EffectiveFrom: effectiveFrom, Days: days}
}

func runSession(date string, km float64, sec int) domain.Session {
	return domain.Session{PerformedOn: date, Kind: domain.KindRun, DistanceKm: f64(km), DurationSec: iptr(sec)}
}

func weightSession(date string, sets ...domain.SessionSet) domain.Session {
	return domain.Session{PerformedOn: date, Kind: domain.KindWeight, Sets: sets}
}

func sets(exercise string, weight float64, reps []int) []domain.SessionSet {
	out := make([]domain.SessionSet, 0, len(reps))
	for _, r := range reps {
		out = append(out, domain.SessionSet{Exercise: exercise, WeightKg: f64(weight), Reps: r})
	}
	return out
}

func TestScore(t *testing.T) {
	runDay := &domain.PlanDay{Weekday: 1, Kind: domain.KindRun, DistanceKm: f64(5), PaceSecPerKm: iptr(300)}
	freeRun := &domain.PlanDay{Weekday: 1, Kind: domain.KindRun}
	liftDay := &domain.PlanDay{Weekday: 6, Kind: domain.KindWeight, Exercises: []domain.PlannedExercise{{Name: "스쿼트", Sets: 4, Reps: 5}}}

	tests := []struct {
		name     string
		planned  *domain.PlanDay
		sessions []domain.Session
		past     bool
		status   domain.DayStatus
		level    int
		ratio    float64
	}{
		{"no plan no record", nil, nil, true, domain.StatusRest, 0, 0},
		{"unplanned workout", nil, []domain.Session{runSession("", 3, 900)}, true, domain.StatusExtra, 3, 1},
		{"missed past plan", runDay, nil, true, domain.StatusMissed, 0, 0},
		{"plan today not yet", runDay, nil, false, domain.StatusPlanned, 0, 0},
		{"full distance", runDay, []domain.Session{runSession("", 5.1, 1500)}, true, domain.StatusDone, 4, 1},
		{"two runs add up", runDay, []domain.Session{runSession("", 2.5, 750), runSession("", 2.5, 750)}, true, domain.StatusDone, 4, 1},
		{"half distance", runDay, []domain.Session{runSession("", 2.5, 750)}, true, domain.StatusPartial, 2, 0.5},
		{"duration only uses target pace", runDay, []domain.Session{{Kind: domain.KindRun, DurationSec: iptr(1200)}}, true, domain.StatusPartial, 3, 0.8},
		{"no distance target", freeRun, []domain.Session{runSession("", 1, 400)}, true, domain.StatusDone, 4, 1},
		{"other kind instead", runDay, []domain.Session{weightSession("", sets("스쿼트", 60, []int{5})...)}, true, domain.StatusPartial, 1, 0.3},
		{"all sets", liftDay, []domain.Session{weightSession("", sets("스쿼트", 80, []int{5, 5, 5, 5})...)}, true, domain.StatusDone, 4, 1},
		{"some sets", liftDay, []domain.Session{weightSession("", sets("스쿼트", 80, []int{5, 5, 5})...)}, true, domain.StatusPartial, 3, 0.75},
		{"synced lift without sets", liftDay, []domain.Session{{Kind: domain.KindWeight, DurationSec: iptr(3000)}}, true, domain.StatusDone, 4, 1},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			status, ratio, level := Score(tc.planned, tc.sessions, tc.past)
			if status != tc.status || level != tc.level || math.Abs(ratio-tc.ratio) > 0.001 {
				t.Errorf("Score() = (%s, %.2f, %d), want (%s, %.2f, %d)", status, ratio, level, tc.status, tc.ratio, tc.level)
			}
		})
	}
}

func TestBuildCalendarUsesPlanInEffectOnEachDay(t *testing.T) {
	// 10/12(월)부터 월수금 러닝 계획, 10/19(월)부터는 월요일만 러닝으로 바꿨다
	oldPlan := weeklyPlan("2026-10-12")
	newDays, _ := NormalizePlanDays([]domain.PlanDay{{Weekday: 1, Kind: domain.KindRun, DistanceKm: f64(3)}})
	newPlan := domain.Plan{ID: "new", EffectiveFrom: "2026-10-19", Days: newDays}
	plans := []domain.Plan{newPlan, oldPlan} // effective_from 내림차순

	sessions := []domain.Session{
		runSession("2026-10-12", 5, 1650),
		runSession("2026-10-19", 3, 1000),
		runSession("2026-10-21", 4, 1300), // 새 계획에서 수요일은 쉬는 날
	}
	days := BuildCalendar(plans, sessions, day("2026-10-11"), day("2026-10-21"), "2026-10-21")

	want := map[string]domain.DayStatus{
		"2026-10-11": domain.StatusRest,   // 첫 계획 전
		"2026-10-12": domain.StatusDone,   // 옛 계획 월요일
		"2026-10-14": domain.StatusMissed, // 옛 계획 수요일
		"2026-10-17": domain.StatusMissed, // 옛 계획 토요일 웨이트
		"2026-10-19": domain.StatusDone,   // 새 계획 월요일 3km
		"2026-10-21": domain.StatusExtra,  // 새 계획에선 쉬는 날
	}
	if len(days) != 11 {
		t.Fatalf("len(days) = %d, want 11", len(days))
	}
	for _, d := range days {
		if status, ok := want[d.Date]; ok && d.Status != status {
			t.Errorf("%s status = %s, want %s", d.Date, d.Status, status)
		}
		if d.Sessions == nil {
			t.Errorf("%s sessions is nil, want empty slice", d.Date)
		}
	}
	if days[0].Weekday != 7 || days[1].Weekday != 1 {
		t.Errorf("weekday of 10/11, 10/12 = %d, %d, want 7, 1", days[0].Weekday, days[1].Weekday)
	}
}

func TestVdot(t *testing.T) {
	tests := []struct {
		km   float64
		sec  int
		want float64
	}{
		{5, 20 * 60, 49.8},       // Daniels 표: 5km 20:00 ≈ 49.8
		{10, 50 * 60, 39.9},      // 10km 50:00 ≈ 40
		{42.195, 3 * 3600, 53.5}, // 풀코스 3시간 ≈ 53.5
		{0.5, 120, 0},            // 1km 미만은 추정하지 않는다
		{5, 2 * 60, 0},           // 말이 안 되는 기록
	}
	for _, tc := range tests {
		if got := Vdot(tc.km, tc.sec); math.Abs(got-tc.want) > 0.3 {
			t.Errorf("Vdot(%v, %v) = %v, want ≈ %v", tc.km, tc.sec, got, tc.want)
		}
	}
}

func TestEstimated1RM(t *testing.T) {
	if got := Estimated1RM(100, 1); got != 100 {
		t.Errorf("1 rep = %v, want 100", got)
	}
	if got := Estimated1RM(100, 10); got != 133.3 {
		t.Errorf("100kg x 10 = %v, want 133.3", got)
	}
	if got := Estimated1RM(0, 10); got != 0 {
		t.Errorf("bodyweight = %v, want 0", got)
	}
}

func TestKcal(t *testing.T) {
	if got := SessionKcal(runSession("", 5, 1500), 70); got != 350 {
		t.Errorf("run 5km @70kg = %d, want 350", got)
	}
	if got := SessionKcal(domain.Session{Kind: domain.KindRun, DistanceKm: f64(5), CaloriesKcal: iptr(410)}, 70); got != 410 {
		t.Errorf("device calories should win, got %d", got)
	}
	// 웨이트 10세트 × 3분 = 30분, MET 5 × 70kg × 0.5h = 175
	lift := weightSession("", sets("스쿼트", 80, []int{5, 5, 5, 5, 5, 5, 5, 5, 5, 5})...)
	if got := SessionKcal(lift, 70); got != 175 {
		t.Errorf("lift 10 sets = %d, want 175", got)
	}
	plan := weeklyPlan("2026-10-01")
	if got := PlannedKcal(&plan.Days[0], 70); got != 350 {
		t.Errorf("planned run 5km = %d, want 350", got)
	}
	if got := PlannedKcal(&plan.Days[5], 70); got != 175 {
		t.Errorf("planned lift 10 sets = %d, want 175", got)
	}
	if got := PlannedKcal(&domain.PlanDay{Kind: domain.KindRun, TargetKcal: iptr(500)}, 70); got != 500 {
		t.Errorf("explicit target = %d, want 500", got)
	}
}

func TestBuildSummary(t *testing.T) {
	plans := []domain.Plan{weeklyPlan("2026-10-01")}
	sessions := []domain.Session{
		runSession("2026-09-30", 5, 1800), // 지난달: 칼로리에는 안 들어가고 러닝 통계에는 들어간다
		runSession("2026-10-05", 5, 1650),
		runSession("2026-10-07", 6, 1920),
		weightSession("2026-10-10", append(sets("스쿼트", 80, []int{5, 5, 5}), sets("벤치프레스", 60, []int{8, 6})...)...),
		weightSession("2026-10-17", sets("스쿼트", 85, []int{5, 5, 5, 5, 5})...),
		runSession("2026-10-21", 5, 1500),
	}
	s := BuildSummary(plans, sessions, day("2026-10-01"), day("2026-10-31"), day("2026-10-21"), 70)

	if s.TodayKcal.Target != 350 || s.TodayKcal.Actual != 350 {
		t.Errorf("today kcal = %+v, want target 350 actual 350", s.TodayKcal)
	}
	// 10월 계획: 월수금 13일 × 350 + 토 5일 × 175 = 4550 + 875
	if s.MonthKcal.Target != 5425 {
		t.Errorf("month target = %d, want 5425", s.MonthKcal.Target)
	}
	// 실제: 350 + 420 + 웨이트 5세트(87.5→88) + 5세트(88) + 350
	if s.MonthKcal.Actual != 350+420+88+88+350 {
		t.Errorf("month actual = %d", s.MonthKcal.Actual)
	}
	if s.Run.Count != 4 || s.Run.TargetDistance != 5 || s.Run.TargetPaceSec != 330 {
		t.Errorf("run stats = %+v", s.Run)
	}
	if s.Run.BestPaceSec != 300 {
		t.Errorf("best pace = %d, want 300", s.Run.BestPaceSec)
	}
	if s.Run.Vdot < 38 || s.Run.Vdot > 38.6 {
		t.Errorf("vdot = %v, want ≈ 38.3 (5km 25:00)", s.Run.Vdot)
	}

	if len(s.Exercises) != 2 || s.Exercises[0].Name != "스쿼트" {
		t.Fatalf("exercises = %+v", s.Exercises)
	}
	squat := s.Exercises[0]
	if squat.TopWeightKg != 85 || squat.TopReps != 5 || squat.Sets != 5 || squat.LastDate != "2026-10-17" {
		t.Errorf("squat = %+v", squat)
	}
	// 85 × (1 + 5/30) = 99.2, 직전 80 × (1 + 5/30) = 93.3
	if squat.Estimated1RM != 99.2 || squat.Delta1RM != 5.9 {
		t.Errorf("squat 1RM = %v (Δ %v), want 99.2 (Δ 5.9)", squat.Estimated1RM, squat.Delta1RM)
	}

	if len(s.RunSeries) != 3 || s.RunSeries[0].Kind != "vdot" || len(s.RunSeries[0].Points) != 4 {
		t.Errorf("run series = %+v", s.RunSeries)
	}
}

func TestNormalizePlanDays(t *testing.T) {
	days, err := NormalizePlanDays([]domain.PlanDay{
		{Weekday: 3, Kind: domain.KindRun, DistanceKm: f64(5), Exercises: []domain.PlannedExercise{{Name: "x", Sets: 1, Reps: 1}}},
		{Weekday: 6, Kind: domain.KindWeight, DistanceKm: f64(3), Exercises: []domain.PlannedExercise{{Name: "  ", Sets: 0}, {Name: " 데드리프트 ", Sets: 3, Reps: 5}}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(days) != 7 || days[0].Kind != domain.KindRest || days[6].Weekday != 7 {
		t.Fatalf("days = %+v, want 7 days Mon..Sun", days)
	}
	if days[2].Exercises != nil {
		t.Errorf("run day kept exercises: %+v", days[2])
	}
	if days[5].DistanceKm != nil || len(days[5].Exercises) != 1 || days[5].Exercises[0].Name != "데드리프트" {
		t.Errorf("weight day = %+v", days[5])
	}

	for name, bad := range map[string][]domain.PlanDay{
		"weekday 0":    {{Weekday: 0, Kind: domain.KindRun}},
		"duplicate":    {{Weekday: 1, Kind: domain.KindRun}, {Weekday: 1, Kind: domain.KindRest}},
		"unknown kind": {{Weekday: 1, Kind: "swim"}},
		"too far":      {{Weekday: 1, Kind: domain.KindRun, DistanceKm: f64(300)}},
		"zero sets":    {{Weekday: 6, Kind: domain.KindWeight, Exercises: []domain.PlannedExercise{{Name: "스쿼트", Sets: 0, Reps: 5}}}},
	} {
		if _, err := NormalizePlanDays(bad); !errors.Is(err, domain.ErrInvalidInput) {
			t.Errorf("%s: err = %v, want ErrInvalidInput", name, err)
		}
	}
}

func TestPlanFor(t *testing.T) {
	plans := []domain.Plan{{ID: "b", EffectiveFrom: "2026-10-19"}, {ID: "a", EffectiveFrom: "2026-10-01"}}
	for date, want := range map[string]string{"2026-09-30": "", "2026-10-01": "a", "2026-10-18": "a", "2026-10-19": "b", "2027-01-01": "b"} {
		got := ""
		if p := PlanFor(plans, date); p != nil {
			got = p.ID
		}
		if got != want {
			t.Errorf("PlanFor(%s) = %q, want %q", date, got, want)
		}
	}
}

func TestNormalizeSession(t *testing.T) {
	ok, err := NormalizeSession(SessionInput{
		PerformedOn: "2026-10-21",
		Kind:        domain.KindWeight,
		DistanceKm:  f64(3), // 웨이트에는 거리가 없다
		Sets:        []domain.SessionSet{{Exercise: " 스쿼트 ", WeightKg: f64(80), Reps: 5}, {Exercise: "", Reps: 5}},
	}, "2026-10-21")
	if err != nil {
		t.Fatal(err)
	}
	if ok.DistanceKm != nil || len(ok.Sets) != 1 || ok.Sets[0].Exercise != "스쿼트" || ok.Title != "웨이트" {
		t.Errorf("normalized = %+v", ok)
	}

	for name, in := range map[string]SessionInput{
		"future":            {PerformedOn: "2026-10-25", Kind: domain.KindRun, DistanceKm: f64(5)},
		"bad date":          {PerformedOn: "21/10/2026", Kind: domain.KindRun, DistanceKm: f64(5)},
		"run without data":  {PerformedOn: "2026-10-21", Kind: domain.KindRun},
		"lift without data": {PerformedOn: "2026-10-21", Kind: domain.KindWeight},
		"zero reps":         {PerformedOn: "2026-10-21", Kind: domain.KindWeight, Sets: []domain.SessionSet{{Exercise: "스쿼트", Reps: 0}}},
		"unknown kind":      {PerformedOn: "2026-10-21", Kind: "rest", DurationSec: iptr(60)},
	} {
		if _, err := NormalizeSession(in, "2026-10-21"); !errors.Is(err, domain.ErrInvalidInput) {
			t.Errorf("%s: err = %v, want ErrInvalidInput", name, err)
		}
	}
}
