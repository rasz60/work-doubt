package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SessionRepository struct {
	pool *pgxpool.Pool
}

func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

var _ domain.SessionRepository = (*SessionRepository)(nil)

const sessionColumns = `id, user_id, performed_on, kind, title, distance_km, duration_sec, calories_kcal,
	avg_heart_rate, coalesce(memo, ''), source, connection_id, created_at, updated_at`

func (r *SessionRepository) Create(ctx context.Context, s *domain.Session) error {
	day, err := parseDate(s.PerformedOn)
	if err != nil {
		return err
	}
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		const q = `
			INSERT INTO workout.sessions
				(id, user_id, performed_on, kind, title, distance_km, duration_sec, calories_kcal,
				 avg_heart_rate, memo, source, connection_id, external_id)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, nullif($10, ''), $11, $12, nullif($13, ''))
			RETURNING created_at, updated_at`

		err := tx.QueryRow(ctx, q,
			s.ID, s.UserID, day, string(s.Kind), s.Title, s.DistanceKm, s.DurationSec, s.CaloriesKcal,
			s.AvgHeartRate, s.Memo, string(s.Source), s.ConnectionID, s.ExternalID,
		).Scan(&s.CreatedAt, &s.UpdatedAt)
		if err != nil {
			return translate("session repository: create", err)
		}
		return insertSets(ctx, tx, s.ID, s.Sets)
	})
}

func (r *SessionRepository) Update(ctx context.Context, s *domain.Session) error {
	day, err := parseDate(s.PerformedOn)
	if err != nil {
		return err
	}
	return pgx.BeginFunc(ctx, r.pool, func(tx pgx.Tx) error {
		const q = `
			UPDATE workout.sessions
			   SET performed_on = $3, kind = $4, title = $5, distance_km = $6, duration_sec = $7,
			       calories_kcal = $8, avg_heart_rate = $9, memo = nullif($10, ''), updated_at = now()
			 WHERE id = $1 AND user_id = $2
			RETURNING updated_at`

		err := tx.QueryRow(ctx, q,
			s.ID, s.UserID, day, string(s.Kind), s.Title, s.DistanceKm, s.DurationSec,
			s.CaloriesKcal, s.AvgHeartRate, s.Memo,
		).Scan(&s.UpdatedAt)
		if err != nil {
			return translate("session repository: update", err)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM workout.session_sets WHERE session_id = $1`, s.ID); err != nil {
			return translate("session repository: clear sets", err)
		}
		return insertSets(ctx, tx, s.ID, s.Sets)
	})
}

// UpsertExternal 은 연동이 주는 값(날짜 · 종류 · 제목 · 거리 · 시간 · 칼로리 · 심박)만 고친다.
// 사용자가 붙인 메모와 세트는 그대로 둔다.
func (r *SessionRepository) UpsertExternal(ctx context.Context, s *domain.Session) (bool, error) {
	if s.ExternalID == "" {
		return false, fmt.Errorf("session repository: upsert external without external_id: %w", domain.ErrInvalidInput)
	}
	day, err := parseDate(s.PerformedOn)
	if err != nil {
		return false, err
	}

	// xmax = 0 이면 새로 넣은 행이다
	const q = `
		INSERT INTO workout.sessions
			(id, user_id, performed_on, kind, title, distance_km, duration_sec, calories_kcal,
			 avg_heart_rate, source, connection_id, external_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		ON CONFLICT (user_id, source, external_id) DO UPDATE
		   SET performed_on   = excluded.performed_on,
		       kind           = excluded.kind,
		       title          = excluded.title,
		       distance_km    = excluded.distance_km,
		       duration_sec   = excluded.duration_sec,
		       calories_kcal  = coalesce(excluded.calories_kcal, sessions.calories_kcal),
		       avg_heart_rate = coalesce(excluded.avg_heart_rate, sessions.avg_heart_rate),
		       connection_id  = excluded.connection_id,
		       updated_at     = now()
		RETURNING id, created_at, updated_at, (xmax = 0)`

	var created bool
	err = r.pool.QueryRow(ctx, q,
		s.ID, s.UserID, day, string(s.Kind), s.Title, s.DistanceKm, s.DurationSec, s.CaloriesKcal,
		s.AvgHeartRate, string(s.Source), s.ConnectionID, s.ExternalID,
	).Scan(&s.ID, &s.CreatedAt, &s.UpdatedAt, &created)
	if err != nil {
		return false, translate("session repository: upsert external", err)
	}
	return created, nil
}

func (r *SessionRepository) Delete(ctx context.Context, userID, id string) error {
	// 세트는 ON DELETE CASCADE 로 함께 지워진다
	tag, err := r.pool.Exec(ctx, `DELETE FROM workout.sessions WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return translate("session repository: delete", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("session repository: delete %s: %w", id, domain.ErrNotFound)
	}
	return nil
}

func (r *SessionRepository) Find(ctx context.Context, userID, id string) (*domain.Session, error) {
	q := fmt.Sprintf(`SELECT %s FROM workout.sessions WHERE id = $1 AND user_id = $2`, sessionColumns)
	sessions, err := r.query(ctx, "find", q, id, userID)
	if err != nil {
		return nil, err
	}
	if len(sessions) == 0 {
		return nil, fmt.Errorf("session repository: find %s: %w", id, domain.ErrNotFound)
	}
	return &sessions[0], nil
}

func (r *SessionRepository) List(ctx context.Context, userID, from, to string) ([]domain.Session, error) {
	start, err := parseDate(from)
	if err != nil {
		return nil, err
	}
	end, err := parseDate(to)
	if err != nil {
		return nil, err
	}
	// idx_sessions_user_performed_on (user_id, performed_on DESC) 를 탄다
	q := fmt.Sprintf(`
		SELECT %s FROM workout.sessions
		 WHERE user_id = $1 AND performed_on BETWEEN $2 AND $3
		 ORDER BY performed_on, created_at`, sessionColumns)
	return r.query(ctx, "list", q, userID, start, end)
}

// query 는 기록을 읽고, 그 기록들의 세트를 한 번에 붙인다.
func (r *SessionRepository) query(ctx context.Context, op, q string, args ...any) ([]domain.Session, error) {
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, translate("session repository: "+op, err)
	}
	defer rows.Close()

	sessions := make([]domain.Session, 0, 32)
	index := map[string]int{}
	ids := make([]string, 0, 32)
	for rows.Next() {
		var s domain.Session
		var day time.Time
		var kind, source string
		if err := rows.Scan(
			&s.ID, &s.UserID, &day, &kind, &s.Title, &s.DistanceKm, &s.DurationSec, &s.CaloriesKcal,
			&s.AvgHeartRate, &s.Memo, &source, &s.ConnectionID, &s.CreatedAt, &s.UpdatedAt,
		); err != nil {
			return nil, translate("session repository: "+op+" scan", err)
		}
		s.PerformedOn = day.Format(domain.DateLayout)
		s.Kind = domain.WorkoutKind(kind)
		s.Source = domain.SessionSource(source)
		s.Sets = []domain.SessionSet{}
		index[s.ID] = len(sessions)
		ids = append(ids, s.ID)
		sessions = append(sessions, s)
	}
	if err := rows.Err(); err != nil {
		return nil, translate("session repository: "+op+" rows", err)
	}
	rows.Close()

	if len(ids) == 0 {
		return sessions, nil
	}

	// uq_session_sets_session_position (session_id, position) 를 탄다
	setRows, err := r.pool.Query(ctx, `
		SELECT session_id, exercise, weight_kg, reps
		  FROM workout.session_sets
		 WHERE session_id = ANY($1::uuid[])
		 ORDER BY session_id, position`, ids)
	if err != nil {
		return nil, translate("session repository: "+op+" sets", err)
	}
	defer setRows.Close()

	for setRows.Next() {
		var sessionID string
		var set domain.SessionSet
		if err := setRows.Scan(&sessionID, &set.Exercise, &set.WeightKg, &set.Reps); err != nil {
			return nil, translate("session repository: "+op+" sets scan", err)
		}
		if i, ok := index[sessionID]; ok {
			sessions[i].Sets = append(sessions[i].Sets, set)
		}
	}
	return sessions, translate("session repository: "+op+" sets rows", setRows.Err())
}

// insertSets 는 세트를 한 문장으로 넣는다 (풀러를 거치므로 왕복을 줄인다).
func insertSets(ctx context.Context, tx pgx.Tx, sessionID string, sets []domain.SessionSet) error {
	if len(sets) == 0 {
		return nil
	}
	positions := make([]int32, len(sets))
	exercises := make([]string, len(sets))
	weights := make([]*float64, len(sets))
	reps := make([]int32, len(sets))
	for i, set := range sets {
		positions[i] = int32(i + 1)
		exercises[i] = set.Exercise
		weights[i] = set.WeightKg
		reps[i] = int32(set.Reps)
	}

	const q = `
		INSERT INTO workout.session_sets (id, session_id, position, exercise, weight_kg, reps)
		SELECT gen_random_uuid(), $1::uuid, t.position, t.exercise, t.weight_kg, t.reps
		  FROM unnest($2::smallint[], $3::text[], $4::numeric[], $5::integer[]) AS t(position, exercise, weight_kg, reps)`

	_, err := tx.Exec(ctx, q, sessionID, positions, exercises, weights, reps)
	return translate("session repository: insert sets", err)
}

func parseDate(value string) (time.Time, error) {
	t, err := time.Parse(domain.DateLayout, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("repository: bad date %q: %w", value, domain.ErrInvalidInput)
	}
	return t, nil
}
