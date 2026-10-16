package postgres

import (
	"context"
	"fmt"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// metricColumns 는 MetricKind → 실제 컬럼명 화이트리스트다.
// 쿼리에 컬럼명을 문자열로 끼워 넣기 때문에, 이 맵을 통과하지 않은 값은 절대 쓰지 않는다.
var metricColumns = map[domain.MetricKind]string{
	domain.MetricWeight:         "weight_kg",
	domain.MetricHeight:         "height_cm",
	domain.MetricSkeletalMuscle: "skeletal_muscle_kg",
	domain.MetricBodyFatPct:     "body_fat_percentage",
	domain.MetricBMI:            "bmi",
}

type BodyMetricRepository struct {
	pool *pgxpool.Pool
}

func NewBodyMetricRepository(pool *pgxpool.Pool) *BodyMetricRepository {
	return &BodyMetricRepository{pool: pool}
}

var _ domain.BodyMetricRepository = (*BodyMetricRepository)(nil)

const bodyMetricColumns = `id, user_id, measured_at, height_cm, weight_kg,
	skeletal_muscle_kg, body_fat_percentage, bmi, coalesce(memo, ''), created_at`

func (r *BodyMetricRepository) Upsert(ctx context.Context, m *domain.BodyMetric) error {
	// bmi 는 generated column 이므로 INSERT 대상이 아니다.
	const q = `
		INSERT INTO workout.body_metrics
			(id, user_id, measured_at, height_cm, weight_kg, skeletal_muscle_kg, body_fat_percentage, memo)
		VALUES ($1, $2, $3, $4, $5, $6, $7, nullif($8, ''))
		ON CONFLICT (user_id, measured_at) DO UPDATE
		   SET height_cm           = coalesce(excluded.height_cm, body_metrics.height_cm),
		       weight_kg           = coalesce(excluded.weight_kg, body_metrics.weight_kg),
		       skeletal_muscle_kg  = coalesce(excluded.skeletal_muscle_kg, body_metrics.skeletal_muscle_kg),
		       body_fat_percentage = coalesce(excluded.body_fat_percentage, body_metrics.body_fat_percentage),
		       memo                = coalesce(excluded.memo, body_metrics.memo)
		RETURNING id, bmi, created_at`

	err := r.pool.QueryRow(ctx, q,
		m.ID, m.UserID, m.MeasuredAt, m.HeightCm, m.WeightKg, m.SkeletalMuscleKg, m.BodyFatPct, m.Memo,
	).Scan(&m.ID, &m.BMI, &m.CreatedAt)
	return translate("body metric repository: upsert", err)
}

func (r *BodyMetricRepository) Delete(ctx context.Context, userID, id string) error {
	const q = `DELETE FROM workout.body_metrics WHERE id = $1 AND user_id = $2`

	tag, err := r.pool.Exec(ctx, q, id, userID)
	if err != nil {
		return translate("body metric repository: delete", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("body metric repository: delete %s: %w", id, domain.ErrNotFound)
	}
	return nil
}

func (r *BodyMetricRepository) Latest(ctx context.Context, userID string) (*domain.BodyMetric, error) {
	// idx_body_metrics_user_measured_at (user_id, measured_at DESC) 를 탄다.
	q := fmt.Sprintf(`
		SELECT %s FROM workout.body_metrics
		 WHERE user_id = $1
		 ORDER BY measured_at DESC
		 LIMIT 1`, bodyMetricColumns)

	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, translate("body metric repository: latest", err)
	}
	defer rows.Close()

	records, err := scanBodyMetrics(rows)
	if err != nil {
		return nil, translate("body metric repository: latest", err)
	}
	if len(records) == 0 {
		return nil, fmt.Errorf("body metric repository: latest for %s: %w", userID, domain.ErrNotFound)
	}
	return &records[0], nil
}

func (r *BodyMetricRepository) List(ctx context.Context, userID string, mr domain.MetricRange, limit int) ([]domain.BodyMetric, error) {
	q := fmt.Sprintf(`
		SELECT %s FROM workout.body_metrics
		 WHERE user_id = $1 AND measured_at BETWEEN $2 AND $3
		 ORDER BY measured_at DESC
		 LIMIT $4`, bodyMetricColumns)

	rows, err := r.pool.Query(ctx, q, userID, mr.From, mr.To, limit)
	if err != nil {
		return nil, translate("body metric repository: list", err)
	}
	defer rows.Close()

	records, err := scanBodyMetrics(rows)
	if err != nil {
		return nil, translate("body metric repository: list", err)
	}
	return records, nil
}

func (r *BodyMetricRepository) Series(ctx context.Context, userID string, kind domain.MetricKind, mr domain.MetricRange) ([]domain.MetricPoint, error) {
	column, ok := metricColumns[kind]
	if !ok {
		return nil, fmt.Errorf("body metric repository: unknown metric %q: %w", kind, domain.ErrInvalidInput)
	}

	// 차트는 오름차순이어야 하고, NULL 인 지표는 점으로 그리지 않는다.
	q := fmt.Sprintf(`
		SELECT measured_at, %s
		  FROM workout.body_metrics
		 WHERE user_id = $1
		   AND measured_at BETWEEN $2 AND $3
		   AND %s IS NOT NULL
		 ORDER BY measured_at`, column, column)

	rows, err := r.pool.Query(ctx, q, userID, mr.From, mr.To)
	if err != nil {
		return nil, translate("body metric repository: series", err)
	}
	defer rows.Close()

	points := make([]domain.MetricPoint, 0, 64)
	for rows.Next() {
		var p domain.MetricPoint
		if err := rows.Scan(&p.MeasuredAt, &p.Value); err != nil {
			return nil, translate("body metric repository: series scan", err)
		}
		points = append(points, p)
	}
	if err := rows.Err(); err != nil {
		return nil, translate("body metric repository: series rows", err)
	}
	return points, nil
}

type rowScanner interface {
	Next() bool
	Scan(dest ...any) error
	Err() error
}

func scanBodyMetrics(rows rowScanner) ([]domain.BodyMetric, error) {
	records := make([]domain.BodyMetric, 0, 32)
	for rows.Next() {
		var m domain.BodyMetric
		if err := rows.Scan(
			&m.ID, &m.UserID, &m.MeasuredAt, &m.HeightCm, &m.WeightKg,
			&m.SkeletalMuscleKg, &m.BodyFatPct, &m.BMI, &m.Memo, &m.CreatedAt,
		); err != nil {
			return nil, err
		}
		records = append(records, m)
	}
	return records, rows.Err()
}
