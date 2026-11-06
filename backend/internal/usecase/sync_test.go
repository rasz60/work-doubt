package usecase

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
)

// ── 가짜 저장소 ─────────────────────────────

type fakeConns struct {
	byID map[string]*domain.SyncConnection
}

func newFakeConns() *fakeConns {
	return &fakeConns{byID: map[string]*domain.SyncConnection{}}
}

func (f *fakeConns) Save(_ context.Context, c *domain.SyncConnection) error {
	for _, existing := range f.byID {
		if existing.UserID == c.UserID && existing.Provider == c.Provider && existing.ExternalAccountID == c.ExternalAccountID {
			c.ID = existing.ID
		}
	}
	copied := *c
	f.byID[c.ID] = &copied
	return nil
}

func (f *fakeConns) List(_ context.Context, userID string) ([]domain.SyncConnection, error) {
	var out []domain.SyncConnection
	for _, c := range f.byID {
		if c.UserID == userID {
			out = append(out, *c)
		}
	}
	return out, nil
}

func (f *fakeConns) Find(_ context.Context, userID, id string) (*domain.SyncConnection, error) {
	if c, ok := f.byID[id]; ok && c.UserID == userID {
		copied := *c
		return &copied, nil
	}
	return nil, domain.ErrNotFound
}

func (f *fakeConns) MarkSynced(_ context.Context, id string, at time.Time, syncErr string) error {
	c := f.byID[id]
	c.LastSyncedAt, c.LastError = &at, syncErr
	return nil
}

func (f *fakeConns) Delete(_ context.Context, userID, id string) error {
	delete(f.byID, id)
	return nil
}

type fakeSessions struct {
	all []domain.Session
}

func (f *fakeSessions) Create(_ context.Context, s *domain.Session) error {
	f.all = append(f.all, *s)
	return nil
}
func (f *fakeSessions) Update(context.Context, *domain.Session) error { return nil }
func (f *fakeSessions) Delete(context.Context, string, string) error  { return nil }
func (f *fakeSessions) Find(context.Context, string, string) (*domain.Session, error) {
	return nil, domain.ErrNotFound
}
func (f *fakeSessions) List(_ context.Context, userID, from, to string) ([]domain.Session, error) {
	var out []domain.Session
	for _, s := range f.all {
		if s.UserID == userID && s.PerformedOn >= from && s.PerformedOn <= to {
			out = append(out, s)
		}
	}
	return out, nil
}
func (f *fakeSessions) InsertExternal(_ context.Context, s *domain.Session) (bool, error) {
	for _, e := range f.all {
		if e.UserID == s.UserID && e.Source == s.Source && e.ExternalID == s.ExternalID {
			return false, nil
		}
	}
	f.all = append(f.all, *s)
	return true, nil
}

// external 은 출처|활동 id → 기록이다.
func (f *fakeSessions) external() map[string]domain.Session {
	out := map[string]domain.Session{}
	for _, s := range f.all {
		if s.ExternalID != "" {
			out[string(s.Source)+"|"+s.ExternalID] = s
		}
	}
	return out
}

var testNow = time.Date(2026, 10, 21, 9, 0, 0, 0, time.UTC)

const testUser = "7d9f5a0e-2f43-4c43-9a55-0b1a2d3c4e5f"

func newTestSync() (*Sync, *fakeConns, *fakeSessions) {
	conns := newFakeConns()
	sessions := &fakeSessions{}
	clock := NewClock(time.UTC)
	clock.now = func() time.Time { return testNow }
	return NewSync(conns, sessions, clock), conns, sessions
}

// ── 테스트 ─────────────────────────────

func TestKindFromType(t *testing.T) {
	for in, want := range map[string]domain.WorkoutKind{
		"Running":                       domain.KindRun,
		"HKWorkoutActivityTypeRunning":  domain.KindRun,
		"실외 달리기":                        domain.KindRun,
		"Traditional Strength Training": domain.KindWeight,
		"웨이트":                           domain.KindWeight,
		"Cycling":                       domain.KindOther,
		"":                              domain.KindOther,
	} {
		if got := KindFromType(in); got != want {
			t.Errorf("KindFromType(%q) = %s, want %s", in, got, want)
		}
	}
}

func TestAppleHealth(t *testing.T) {
	s, conns, sessions := newTestSync()
	ctx := context.Background()

	// 처음 연결: 최근 운동이 없어도 연결은 생기고 오류가 남지 않는다
	if _, err := s.AppleHealth(ctx, testUser, nil); err != nil {
		t.Fatal(err)
	}
	if len(conns.byID) != 1 {
		t.Fatalf("connections = %d, want 1", len(conns.byID))
	}

	workouts := []IngestWorkout{
		{ID: "hk-1", Date: "2026-10-21", Start: "2026-10-21T07:10:00+09:00", Type: "running", DistanceM: f64(5230), DurationSec: f64(1710)},
		{ID: "hk-2", Date: "2026-10-20", Type: "strength", DurationSec: f64(2700)},
	}
	result, err := s.AppleHealth(ctx, testUser, workouts)
	if err != nil {
		t.Fatal(err)
	}
	if result.Saved != 2 {
		t.Fatalf("result = %+v", result)
	}
	// 다시 보내도 연결 · 기록이 늘지 않는다
	if _, err := s.AppleHealth(ctx, testUser, workouts); err != nil {
		t.Fatal(err)
	}
	if len(conns.byID) != 1 || len(sessions.external()) != 2 {
		t.Fatalf("connections = %d, records = %d", len(conns.byID), len(sessions.external()))
	}
	for _, c := range conns.byID {
		if c.Provider != domain.ProviderAppleHealth || c.LastError != "" || c.LastSyncedAt == nil {
			t.Errorf("connection = %+v", c)
		}
	}
	for _, v := range sessions.external() {
		if v.Source != domain.SourceAppleHealth {
			t.Errorf("source = %q", v.Source)
		}
	}
}

// HealthKit 이 보내는 여러 단위 · 시각 형식을 기록으로 바꾸고, 기록할 수 없는 운동은 건너뛴다
func TestAppleHealthConversion(t *testing.T) {
	s, _, sessions := newTestSync()
	ctx := context.Background()

	workouts := []IngestWorkout{
		{Start: "2026-10-21T07:10:00+09:00", Type: "Running", DistanceM: f64(5230), DurationMin: f64(28.5), CaloriesKcal: f64(321.4)},
		{Date: "2026-10-20", Type: "근력 운동", DurationSec: f64(2700)},
		{Date: "2026-10-30", Type: "Running", DistanceKm: f64(5)}, // 미래 → 건너뜀
		{Type: "Running", DistanceKm: f64(5)},                     // 날짜 없음 → 건너뜀
	}
	result, err := s.AppleHealth(ctx, testUser, workouts)
	if err != nil {
		t.Fatal(err)
	}
	if result.Saved != 2 || result.Skipped != 2 || len(result.Errors) != 2 {
		t.Fatalf("result = %+v", result)
	}

	var run domain.Session
	for _, v := range sessions.external() {
		if v.Kind == domain.KindRun {
			run = v
		}
	}
	if run.PerformedOn != "2026-10-21" || *run.DistanceKm != 5.23 || *run.DurationSec != 1710 || *run.CaloriesKcal != 321 {
		t.Errorf("run = %+v", run)
	}
	if run.Source != domain.SourceAppleHealth || run.ConnectionID == nil || run.UserID != testUser {
		t.Errorf("run source = %+v", run)
	}

	// id 없이 같은 기록을 다시 보내도 날짜 · 종류 · 거리 · 시간으로 알아보고 늘지 않는다
	if _, err := s.AppleHealth(ctx, testUser, workouts[:2]); err != nil {
		t.Fatal(err)
	}
	if len(sessions.external()) != 2 {
		t.Errorf("re-sent workouts duplicated: %d records", len(sessions.external()))
	}
}

func TestDisconnect(t *testing.T) {
	s, conns, sessions := newTestSync()
	ctx := context.Background()

	if _, err := s.AppleHealth(ctx, testUser, []IngestWorkout{{ID: "hk-1", Date: "2026-10-21", Type: "running", DistanceKm: f64(5)}}); err != nil {
		t.Fatal(err)
	}
	var id string
	for k := range conns.byID {
		id = k
	}
	if err := s.Disconnect(ctx, "11111111-1111-1111-1111-111111111111", id); !errors.Is(err, domain.ErrNotFound) {
		t.Errorf("other user's disconnect err = %v, want ErrNotFound", err)
	}
	if err := s.Disconnect(ctx, testUser, id); err != nil {
		t.Fatal(err)
	}
	if len(conns.byID) != 0 {
		t.Error("connection not deleted")
	}
	if len(sessions.external()) != 1 {
		t.Error("received records should stay after disconnect")
	}
}

func TestIsDuplicate(t *testing.T) {
	conn := "conn-1"
	other := "conn-2"
	apple := func(id, date string, km float64, sec int) *domain.Session {
		return &domain.Session{PerformedOn: date, Kind: domain.KindRun, Source: domain.SourceAppleHealth, ConnectionID: &conn, ExternalID: id, DistanceKm: f64(km), DurationSec: iptr(sec)}
	}
	manualRun := &domain.Session{PerformedOn: "2026-10-19", Kind: domain.KindRun, Source: domain.SourceManual, DistanceKm: f64(5), DurationSec: iptr(1500)}
	manualLift := &domain.Session{PerformedOn: "2026-10-19", Kind: domain.KindWeight, Source: domain.SourceManual, Sets: []domain.SessionSet{{Exercise: "스쿼트", Reps: 5}}}
	device := &domain.Session{PerformedOn: "2026-10-19", Kind: domain.KindRun, Source: domain.SourceDevice, ConnectionID: &other, ExternalID: "d1", DistanceKm: f64(5.05), DurationSec: iptr(1530)}

	tests := []struct {
		name string
		e, c *domain.Session
		want bool
	}{
		{"same activity fetched again", apple("1", "2026-10-19", 5, 1500), apple("1", "2026-10-19", 5, 1500), true},
		{"two runs a day on same feed", apple("1", "2026-10-19", 5, 1500), apple("2", "2026-10-19", 5, 1510), false},
		{"manual run already entered", manualRun, apple("3", "2026-10-19", 5.1, 1520), true},
		{"old device record same run", device, apple("4", "2026-10-19", 5.0, 1500), true},
		{"different distance", manualRun, apple("5", "2026-10-19", 10, 3100), false},
		{"different day", manualRun, apple("6", "2026-10-20", 5, 1500), false},
		{"lift entered by hand vs synced lift", manualLift, &domain.Session{PerformedOn: "2026-10-19", Kind: domain.KindWeight, Source: domain.SourceAppleHealth, ConnectionID: &conn, ExternalID: "7", DurationSec: iptr(3000)}, true},
		{"run vs lift same day", manualLift, apple("8", "2026-10-19", 5, 1500), false},
	}
	for _, tc := range tests {
		if got := IsDuplicate(tc.e, tc.c); got != tc.want {
			t.Errorf("%s: IsDuplicate = %v, want %v", tc.name, got, tc.want)
		}
	}
}
