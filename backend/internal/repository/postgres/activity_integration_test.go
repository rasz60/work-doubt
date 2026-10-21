//go:build integration

// 실제 Postgres 로 계획 · 기록 · 연동 저장소를 확인한다. 0001 · 0002 마이그레이션을 적용한 빈 DB 가 필요하다.
//
//	docker run -d --name workout-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:17-alpine
//	(auth.users 를 흉내 내는 스키마 + 마이그레이션 적용 — README 참고)
//	TEST_DATABASE_URL=postgres://postgres:pw@localhost:55432/postgres go test -tags integration ./internal/repository/postgres/
package postgres

import (
	"context"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func f64(v float64) *float64 { return &v }
func iptr(v int) *int        { return &v }

func connect(t *testing.T, mode string) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL 이 없어 건너뜀")
	}
	pool, err := Connect(context.Background(), url, Options{MaxConns: 2, QueryMode: mode})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func newUser(t *testing.T, pool *pgxpool.Pool) string {
	t.Helper()
	id := uuid.NewString()
	ctx := context.Background()
	if _, err := pool.Exec(ctx, `INSERT INTO auth.users (id) VALUES ($1)`, id); err != nil {
		t.Fatal(err)
	}
	if err := NewUserRepository(pool).Ensure(ctx, id, id+"@test", "tester"); err != nil {
		t.Fatal(err)
	}
	return id
}

// pgx 실행 방식(직접 연결 · transaction 풀러 · simple protocol)마다 같은 쿼리가 통하는지 본다.
func TestActivityRepositories(t *testing.T) {
	for _, mode := range []string{"cache_statement", "exec", "simple"} {
		t.Run(mode, func(t *testing.T) {
			pool := connect(t, mode)
			ctx := context.Background()
			user := newUser(t, pool)

			// ── 계획: 같은 날짜는 덮어쓰고, 목록은 최신 먼저
			plans := NewPlanRepository(pool)
			first := &domain.Plan{ID: uuid.NewString(), UserID: user, EffectiveFrom: "2026-10-01", Title: "기본",
				Days: []domain.PlanDay{{Weekday: 1, Kind: domain.KindRun, DistanceKm: f64(5), PaceSecPerKm: iptr(330)}}}
			if err := plans.Save(ctx, first); err != nil {
				t.Fatal(err)
			}
			again := &domain.Plan{ID: uuid.NewString(), UserID: user, EffectiveFrom: "2026-10-01", Title: "고침",
				Days: []domain.PlanDay{{Weekday: 6, Kind: domain.KindWeight, Exercises: []domain.PlannedExercise{{Name: "스쿼트", Sets: 5, Reps: 5, WeightKg: f64(80)}}}}}
			if err := plans.Save(ctx, again); err != nil {
				t.Fatal(err)
			}
			if again.ID != first.ID {
				t.Errorf("same effective_from should keep id %s, got %s", first.ID, again.ID)
			}
			if err := plans.Save(ctx, &domain.Plan{ID: uuid.NewString(), UserID: user, EffectiveFrom: "2026-10-19", Days: []domain.PlanDay{}}); err != nil {
				t.Fatal(err)
			}
			list, err := plans.List(ctx, user, 10)
			if err != nil {
				t.Fatal(err)
			}
			if len(list) != 2 || list[0].EffectiveFrom != "2026-10-19" || list[1].Title != "고침" ||
				list[1].Days[0].Exercises[0].Name != "스쿼트" || *list[1].Days[0].Exercises[0].WeightKg != 80 {
				t.Errorf("plans = %+v", list)
			}

			// ── 수행 기록: 세트와 함께 넣고 · 고치고 · 읽기
			sessions := NewSessionRepository(pool)
			lift := &domain.Session{ID: uuid.NewString(), UserID: user, PerformedOn: "2026-10-18", Kind: domain.KindWeight,
				Title: "하체", Source: domain.SourceManual, Memo: "무릎 조심",
				Sets: []domain.SessionSet{{Exercise: "스쿼트", WeightKg: f64(80), Reps: 5}, {Exercise: "런지", Reps: 12}}}
			if err := sessions.Create(ctx, lift); err != nil {
				t.Fatal(err)
			}
			lift.Sets = []domain.SessionSet{{Exercise: "스쿼트", WeightKg: f64(82.5), Reps: 5}, {Exercise: "스쿼트", WeightKg: f64(82.5), Reps: 4}, {Exercise: "런지", Reps: 10}}
			if err := sessions.Update(ctx, lift); err != nil {
				t.Fatal(err)
			}
			run := &domain.Session{ID: uuid.NewString(), UserID: user, PerformedOn: "2026-10-20", Kind: domain.KindRun,
				Title: "러닝", Source: domain.SourceManual, DistanceKm: f64(5.25), DurationSec: iptr(1650)}
			if err := sessions.Create(ctx, run); err != nil {
				t.Fatal(err)
			}

			got, err := sessions.List(ctx, user, "2026-10-01", "2026-10-31")
			if err != nil {
				t.Fatal(err)
			}
			if len(got) != 2 || got[0].ID != lift.ID || len(got[0].Sets) != 3 || *got[0].Sets[1].WeightKg != 82.5 ||
				got[0].Sets[2].WeightKg != nil || got[0].Memo != "무릎 조심" || *got[1].DistanceKm != 5.25 || got[1].Sets == nil {
				t.Errorf("sessions = %+v", got)
			}

			// ── 연동: 기기 토큰 연결 + 같은 external_id 는 한 번만, 사용자 메모는 지키기
			conns := NewSyncConnectionRepository(pool)
			device := &domain.SyncConnection{ID: uuid.NewString(), UserID: user, Provider: domain.ProviderDevice, Name: "아이폰"}
			if err := conns.CreateDevice(ctx, device, "hash-"+user); err != nil {
				t.Fatal(err)
			}
			found, err := conns.FindByIngestHash(ctx, "hash-"+user)
			if err != nil || found.ID != device.ID {
				t.Fatalf("find by hash = %+v, %v", found, err)
			}

			synced := &domain.Session{ID: uuid.NewString(), UserID: user, PerformedOn: "2026-10-21", Kind: domain.KindRun, Title: "아침",
				Source: domain.SourceDevice, ConnectionID: &device.ID, ExternalID: "w1", DistanceKm: f64(3), DurationSec: iptr(1000)}
			created, err := sessions.UpsertExternal(ctx, synced)
			if err != nil || !created {
				t.Fatalf("first upsert created=%v err=%v", created, err)
			}
			syncedID := synced.ID
			// 사용자가 메모를 붙인 뒤 기기가 같은 기록을 다시 보낸다
			withMemo := *synced
			withMemo.Memo = "가볍게"
			if err := sessions.Update(ctx, &withMemo); err != nil {
				t.Fatal(err)
			}
			resent := &domain.Session{ID: uuid.NewString(), UserID: user, PerformedOn: "2026-10-21", Kind: domain.KindRun, Title: "아침",
				Source: domain.SourceDevice, ConnectionID: &device.ID, ExternalID: "w1", DistanceKm: f64(3.1), DurationSec: iptr(1000)}
			created, err = sessions.UpsertExternal(ctx, resent)
			if err != nil || created || resent.ID != syncedID {
				t.Fatalf("second upsert created=%v id=%s err=%v", created, resent.ID, err)
			}
			again2, err := sessions.Find(ctx, user, syncedID)
			if err != nil || *again2.DistanceKm != 3.1 || again2.Memo != "가볍게" || again2.Source != domain.SourceDevice || *again2.ConnectionID != device.ID {
				t.Errorf("after resend = %+v, %v", again2, err)
			}

			strava := &domain.SyncConnection{ID: uuid.NewString(), UserID: user, Provider: domain.ProviderStrava, Name: "Strava",
				ExternalAccountID: "42", AccessToken: "a", RefreshToken: "r", TokenExpiresAt: time.Now().Add(time.Hour)}
			if err := conns.SaveOAuth(ctx, strava); err != nil {
				t.Fatal(err)
			}
			reconnect := &domain.SyncConnection{ID: uuid.NewString(), UserID: user, Provider: domain.ProviderStrava, Name: "Strava 2",
				ExternalAccountID: "42", AccessToken: "b", RefreshToken: "r2", TokenExpiresAt: time.Now().Add(time.Hour)}
			if err := conns.SaveOAuth(ctx, reconnect); err != nil {
				t.Fatal(err)
			}
			if reconnect.ID != strava.ID {
				t.Errorf("reconnect made a new row")
			}
			if err := conns.MarkSynced(ctx, strava.ID, time.Now(), "실패"); err != nil {
				t.Fatal(err)
			}
			listed, err := conns.List(ctx, user)
			if err != nil || len(listed) != 2 || listed[1].AccessToken != "" || listed[1].LastError != "실패" || listed[1].Name != "Strava 2" {
				t.Errorf("connections = %+v, %v", listed, err)
			}
			full, err := conns.Find(ctx, user, strava.ID)
			if err != nil || full.AccessToken != "b" {
				t.Errorf("find keeps token: %+v, %v", full, err)
			}

			// 연결을 끊어도 기록은 남는다
			if err := conns.Delete(ctx, user, device.ID); err != nil {
				t.Fatal(err)
			}
			kept, err := sessions.Find(ctx, user, syncedID)
			if err != nil || kept.ConnectionID != nil {
				t.Errorf("session after disconnect = %+v, %v", kept, err)
			}

			// 남의 기록 · 이상한 id
			if err := sessions.Delete(ctx, uuid.NewString(), lift.ID); !errors.Is(err, domain.ErrNotFound) {
				t.Errorf("delete other user's session err = %v", err)
			}
			if _, err := sessions.Find(ctx, user, "not-a-uuid"); !errors.Is(err, domain.ErrNotFound) {
				t.Errorf("bad id err = %v", err)
			}
			if err := sessions.Delete(ctx, user, lift.ID); err != nil {
				t.Fatal(err)
			}
			var left int
			if err := pool.QueryRow(ctx, `SELECT count(*) FROM workout.session_sets WHERE session_id = $1`, lift.ID).Scan(&left); err != nil || left != 0 {
				t.Errorf("sets left after delete = %d, %v", left, err)
			}
		})
	}
}
