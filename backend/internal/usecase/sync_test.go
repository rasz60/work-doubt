package usecase

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
)

// ── 가짜 저장소 · 연동 서비스 ─────────────────────────────

type fakeConns struct {
	byID   map[string]*domain.SyncConnection
	hashes map[string]string // token hash → id
}

func newFakeConns() *fakeConns {
	return &fakeConns{byID: map[string]*domain.SyncConnection{}, hashes: map[string]string{}}
}

func (f *fakeConns) SaveOAuth(_ context.Context, c *domain.SyncConnection) error {
	for _, existing := range f.byID {
		if existing.UserID == c.UserID && existing.Provider == c.Provider && existing.ExternalAccountID == c.ExternalAccountID {
			c.ID = existing.ID
		}
	}
	copied := *c
	f.byID[c.ID] = &copied
	return nil
}

func (f *fakeConns) CreateDevice(_ context.Context, c *domain.SyncConnection, hash string) error {
	copied := *c
	f.byID[c.ID] = &copied
	f.hashes[hash] = c.ID
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

func (f *fakeConns) FindByIngestHash(_ context.Context, hash string) (*domain.SyncConnection, error) {
	if id, ok := f.hashes[hash]; ok {
		copied := *f.byID[id]
		return &copied, nil
	}
	return nil, domain.ErrNotFound
}

func (f *fakeConns) UpdateTokens(_ context.Context, id, access, refresh string, exp time.Time) error {
	c := f.byID[id]
	c.AccessToken, c.RefreshToken, c.TokenExpiresAt = access, refresh, exp
	return nil
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

type fakeStrava struct {
	refreshed  int
	activities []domain.ExternalActivity
	after      time.Time
	before     time.Time
}

func (f *fakeStrava) AuthURL(state string) string {
	return "https://strava.test/authorize?state=" + state
}
func (f *fakeStrava) Exchange(_ context.Context, code string) (*domain.OAuthToken, error) {
	if code != "good" {
		return nil, errors.New("bad code")
	}
	return &domain.OAuthToken{AccessToken: "a1", RefreshToken: "r1", ExpiresAt: testNow.Add(-time.Minute), AccountID: "42", AccountName: "Kim"}, nil
}
func (f *fakeStrava) Refresh(_ context.Context, refresh string) (*domain.OAuthToken, error) {
	f.refreshed++
	return &domain.OAuthToken{AccessToken: "a2", RefreshToken: "r2", ExpiresAt: testNow.Add(6 * time.Hour)}, nil
}
func (f *fakeStrava) Activities(_ context.Context, access string, after, before time.Time) ([]domain.ExternalActivity, error) {
	if access != "a2" {
		return nil, domain.ErrUnauthorized
	}
	f.after, f.before = after, before
	return f.activities, nil
}
func (f *fakeStrava) Revoke(context.Context, string) error { return nil }

var testNow = time.Date(2026, 10, 21, 9, 0, 0, 0, time.UTC)

const testUser = "7d9f5a0e-2f43-4c43-9a55-0b1a2d3c4e5f"

func newTestSync(strava domain.ActivityProvider) (*Sync, *fakeConns, *fakeSessions) {
	conns := newFakeConns()
	sessions := &fakeSessions{}
	clock := NewClock(time.UTC)
	clock.now = func() time.Time { return testNow }
	return NewSync(conns, sessions, strava, "secret", clock), conns, sessions
}

// ── 테스트 ─────────────────────────────

func TestStateRoundTrip(t *testing.T) {
	key := []byte("secret")
	state := signState(key, testUser, testNow.Add(10*time.Minute))

	if got, err := verifyState(key, state, testNow); err != nil || got != testUser {
		t.Fatalf("verifyState() = %q, %v", got, err)
	}
	if _, err := verifyState(key, state, testNow.Add(11*time.Minute)); err == nil {
		t.Error("expired state accepted")
	}
	if _, err := verifyState([]byte("other"), state, testNow); err == nil {
		t.Error("state signed with another key accepted")
	}
	tampered := signState(key, "11111111-1111-1111-1111-111111111111", testNow.Add(time.Hour))
	forged := strings.Split(tampered, ".")[0] + "." + strings.Split(state, ".")[1]
	if _, err := verifyState(key, forged, testNow); err == nil {
		t.Error("forged state accepted")
	}
}

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

func TestIngest(t *testing.T) {
	s, conns, sessions := newTestSync(nil)
	ctx := context.Background()

	conn, token, err := s.CreateDevice(ctx, testUser, " 아이폰 ")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(token, deviceTokenPrefix) || conn.Name != "아이폰" {
		t.Fatalf("token %q, conn %+v", token, conn)
	}
	if _, stored := conns.hashes[token]; stored {
		t.Fatal("raw token stored")
	}

	workouts := []IngestWorkout{
		{Start: "2026-10-21T07:10:00+09:00", Type: "Running", DistanceM: f64(5230), DurationMin: f64(28.5), CaloriesKcal: f64(321.4)},
		{Date: "2026-10-20", Type: "근력 운동", DurationSec: f64(2700)},
		{Date: "2026-10-30", Type: "Running", DistanceKm: f64(5)}, // 미래 → 건너뜀
		{Type: "Running", DistanceKm: f64(5)},                     // 날짜 없음 → 건너뜀
	}
	result, err := s.Ingest(ctx, token, workouts)
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
	if run.Source != domain.SourceDevice || run.ConnectionID == nil || *run.ConnectionID != conn.ID || run.UserID != testUser {
		t.Errorf("run source = %+v", run)
	}

	// 같은 기록을 다시 보내면 새로 늘지 않는다 (id 를 안 보내도 날짜 · 종류 · 거리 · 시간으로 같은 기록을 알아본다)
	if _, err := s.Ingest(ctx, token, workouts[:2]); err != nil {
		t.Fatal(err)
	}
	if len(sessions.external()) != 2 {
		t.Errorf("re-sent workouts duplicated: %d records", len(sessions.external()))
	}
	if conns.byID[conn.ID].LastSyncedAt == nil {
		t.Error("last_synced_at not recorded")
	}

	if _, err := s.Ingest(ctx, "wkd_wrong", workouts); !errors.Is(err, domain.ErrUnauthorized) {
		t.Errorf("wrong token err = %v, want ErrUnauthorized", err)
	}
	if _, err := s.Ingest(ctx, "eyJhbGciOi...", workouts); !errors.Is(err, domain.ErrUnauthorized) {
		t.Errorf("login token err = %v, want ErrUnauthorized", err)
	}
}

func TestStravaConnectAndSync(t *testing.T) {
	strava := &fakeStrava{activities: []domain.ExternalActivity{
		{ExternalID: "1001", Title: "Morning Run", Kind: domain.KindRun, PerformedOn: "2026-10-20", DistanceKm: f64(5.01), DurationSec: iptr(1560)},
		{ExternalID: "1002", Title: "Ride", Kind: domain.KindOther, PerformedOn: "2026-10-19"}, // 거리 · 시간 없음 → 건너뜀
	}}
	s, conns, sessions := newTestSync(strava)
	ctx := context.Background()

	authURL, err := s.StravaAuthURL(testUser)
	if err != nil {
		t.Fatal(err)
	}
	state := authURL[strings.Index(authURL, "state=")+len("state="):]

	if err := s.StravaCallback(ctx, state, "good"); err != nil {
		t.Fatal(err)
	}
	if len(conns.byID) != 1 {
		t.Fatalf("connections = %d, want 1", len(conns.byID))
	}
	var conn *domain.SyncConnection
	for _, c := range conns.byID {
		conn = c
	}
	// 받은 토큰이 이미 만료라 한 번 갱신하고 가져온다
	if strava.refreshed != 1 || conn.AccessToken != "a2" || conn.LastError != "" || conn.Name != "Strava Kim" {
		t.Errorf("connection after callback = %+v (refreshed %d)", conn, strava.refreshed)
	}
	if want := testNow.Add(-firstSyncLookback); !strava.after.Equal(want) {
		t.Errorf("first sync after = %v, want %v", strava.after, want)
	}
	if len(sessions.external()) != 1 || sessions.external()["strava|1001"].Title != "Morning Run" {
		t.Errorf("sessions = %+v", sessions.external())
	}

	// 10분 안에는 다시 가져오지 않고, force 면 가져온다 (마지막 동기화 3일 전부터)
	strava.after = time.Time{}
	if _, err := s.SyncAll(ctx, testUser, false); err != nil {
		t.Fatal(err)
	}
	if !strava.after.IsZero() {
		t.Error("synced again within 10 minutes")
	}
	if _, err := s.SyncAll(ctx, testUser, true); err != nil {
		t.Fatal(err)
	}
	if want := testNow.Add(-resyncOverlap); !strava.after.Equal(want) {
		t.Errorf("resync after = %v, want %v", strava.after, want)
	}

	// 같은 Strava 계정을 다시 연결하면 연결이 늘지 않는다
	authURL, _ = s.StravaAuthURL(testUser)
	if err := s.StravaCallback(ctx, authURL[strings.Index(authURL, "state=")+6:], "good"); err != nil {
		t.Fatal(err)
	}
	if len(conns.byID) != 1 {
		t.Errorf("reconnect created a second connection")
	}

	if err := s.StravaCallback(ctx, "forged.state", "good"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("forged state err = %v", err)
	}
}

func TestStravaDisabled(t *testing.T) {
	s, _, _ := newTestSync(nil)
	if s.StravaEnabled() {
		t.Fatal("enabled without provider")
	}
	if _, err := s.StravaAuthURL(testUser); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("err = %v, want ErrInvalidInput", err)
	}
}

func TestIsDuplicate(t *testing.T) {
	conn := "conn-1"
	other := "conn-2"
	strava := func(id, date string, km float64, sec int) *domain.Session {
		return &domain.Session{PerformedOn: date, Kind: domain.KindRun, Source: domain.SourceStrava, ConnectionID: &conn, ExternalID: id, DistanceKm: f64(km), DurationSec: iptr(sec)}
	}
	manualRun := &domain.Session{PerformedOn: "2026-10-19", Kind: domain.KindRun, Source: domain.SourceManual, DistanceKm: f64(5), DurationSec: iptr(1500)}
	manualLift := &domain.Session{PerformedOn: "2026-10-19", Kind: domain.KindWeight, Source: domain.SourceManual, Sets: []domain.SessionSet{{Exercise: "스쿼트", Reps: 5}}}
	device := &domain.Session{PerformedOn: "2026-10-19", Kind: domain.KindRun, Source: domain.SourceDevice, ConnectionID: &other, ExternalID: "d1", DistanceKm: f64(5.05), DurationSec: iptr(1530)}

	tests := []struct {
		name string
		e, c *domain.Session
		want bool
	}{
		{"same activity fetched again", strava("1", "2026-10-19", 5, 1500), strava("1", "2026-10-19", 5, 1500), true},
		{"two runs a day on same feed", strava("1", "2026-10-19", 5, 1500), strava("2", "2026-10-19", 5, 1510), false},
		{"manual run already entered", manualRun, strava("3", "2026-10-19", 5.1, 1520), true},
		{"other device same run", device, strava("4", "2026-10-19", 5.0, 1500), true},
		{"different distance", manualRun, strava("5", "2026-10-19", 10, 3100), false},
		{"different day", manualRun, strava("6", "2026-10-20", 5, 1500), false},
		{"lift entered by hand vs synced lift", manualLift, &domain.Session{PerformedOn: "2026-10-19", Kind: domain.KindWeight, Source: domain.SourceStrava, ConnectionID: &conn, ExternalID: "7", DurationSec: iptr(3000)}, true},
		{"run vs lift same day", manualLift, strava("8", "2026-10-19", 5, 1500), false},
	}
	for _, tc := range tests {
		if got := IsDuplicate(tc.e, tc.c); got != tc.want {
			t.Errorf("%s: IsDuplicate = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestStravaImportRangeSkipsDuplicates(t *testing.T) {
	strava := &fakeStrava{activities: []domain.ExternalActivity{
		{ExternalID: "1", Title: "Mon run", Kind: domain.KindRun, PerformedOn: "2026-10-19", DistanceKm: f64(5), DurationSec: iptr(1500)},
		{ExternalID: "2", Title: "Tue run", Kind: domain.KindRun, PerformedOn: "2026-10-20", DistanceKm: f64(6), DurationSec: iptr(1900)},
		{ExternalID: "3", Title: "Old run", Kind: domain.KindRun, PerformedOn: "2026-09-01", DistanceKm: f64(3), DurationSec: iptr(1000)},
	}}
	s, conns, sessions := newTestSync(strava)
	ctx := context.Background()
	conn := &domain.SyncConnection{ID: "c1", UserID: testUser, Provider: domain.ProviderStrava, Name: "Strava", ExternalAccountID: "42",
		AccessToken: "a2", RefreshToken: "r", TokenExpiresAt: testNow.Add(time.Hour)}
	_ = conns.SaveOAuth(ctx, conn)

	// 10/19 에 직접 입력한 러닝이 이미 있다 → Strava 의 같은 러닝은 건너뛴다
	_ = sessions.Create(ctx, &domain.Session{UserID: testUser, PerformedOn: "2026-10-19", Kind: domain.KindRun, Source: domain.SourceManual, DistanceKm: f64(5.02), DurationSec: iptr(1490)})

	res, err := s.Import(ctx, testUser, "c1", "2026-10-19", "2026-10-20")
	if err != nil {
		t.Fatal(err)
	}
	if res.Fetched != 2 || res.Saved != 1 || res.Duplicates != 1 {
		t.Fatalf("range import = %+v, want fetched 2 saved 1 duplicates 1", res)
	}
	if !strava.after.Equal(day("2026-10-18")) || !strava.before.Equal(day("2026-10-22")) {
		t.Errorf("window = %v ~ %v", strava.after, strava.before)
	}

	// 같은 기간을 다시 가져오면 하나도 바뀌지 않는다
	again, err := s.Import(ctx, testUser, "c1", "2026-10-19", "2026-10-20")
	if err != nil || again.Saved != 0 || again.Duplicates != 2 {
		t.Fatalf("re-import = %+v, %v", again, err)
	}

	// 전체: 날짜 제한 없이, 남은 9/1 만 새로 들어간다
	all, err := s.Import(ctx, testUser, "c1", "", "")
	if err != nil || all.Fetched != 3 || all.Saved != 1 || all.Duplicates != 2 {
		t.Fatalf("all import = %+v, %v", all, err)
	}
	if strava.after.Unix() != 0 || !strava.before.IsZero() {
		t.Errorf("all window = %v ~ %v", strava.after, strava.before)
	}

	if _, err := s.Import(ctx, testUser, "c1", "2026-10-20", "2026-10-19"); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("reversed range err = %v", err)
	}
	device, _, _ := s.CreateDevice(ctx, testUser, "폰")
	if _, err := s.Import(ctx, testUser, device.ID, "", ""); !errors.Is(err, domain.ErrInvalidInput) {
		t.Errorf("device import err = %v", err)
	}
}
