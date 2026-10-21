package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type PlanRepository struct {
	pool *pgxpool.Pool
}

func NewPlanRepository(pool *pgxpool.Pool) *PlanRepository {
	return &PlanRepository{pool: pool}
}

var _ domain.PlanRepository = (*PlanRepository)(nil)

func (r *PlanRepository) Save(ctx context.Context, p *domain.Plan) error {
	effectiveFrom, err := time.Parse(domain.DateLayout, p.EffectiveFrom)
	if err != nil {
		return fmt.Errorf("plan repository: save: %w", domain.ErrInvalidInput)
	}
	days, err := json.Marshal(p.Days)
	if err != nil {
		return fmt.Errorf("plan repository: marshal days: %w", err)
	}

	// days 는 문자열로 넘긴다 ([]byte 는 simple protocol 에서 bytea 로 보내진다)
	const q = `
		INSERT INTO workout.plans (id, user_id, effective_from, title, days)
		VALUES ($1, $2, $3, $4, $5::jsonb)
		ON CONFLICT (user_id, effective_from) DO UPDATE
		   SET title = excluded.title,
		       days  = excluded.days
		RETURNING id, created_at`

	err = r.pool.QueryRow(ctx, q, p.ID, p.UserID, effectiveFrom, p.Title, string(days)).Scan(&p.ID, &p.CreatedAt)
	return translate("plan repository: save", err)
}

func (r *PlanRepository) List(ctx context.Context, userID string, limit int) ([]domain.Plan, error) {
	// uq_plans_user_effective_from (user_id, effective_from) 를 거꾸로 읽는다.
	const q = `
		SELECT id, user_id, effective_from, title, days::text, created_at
		  FROM workout.plans
		 WHERE user_id = $1
		 ORDER BY effective_from DESC
		 LIMIT $2`

	rows, err := r.pool.Query(ctx, q, userID, limit)
	if err != nil {
		return nil, translate("plan repository: list", err)
	}
	defer rows.Close()

	plans := make([]domain.Plan, 0, 8)
	for rows.Next() {
		var p domain.Plan
		var effectiveFrom time.Time
		var days string
		if err := rows.Scan(&p.ID, &p.UserID, &effectiveFrom, &p.Title, &days, &p.CreatedAt); err != nil {
			return nil, translate("plan repository: list scan", err)
		}
		p.EffectiveFrom = effectiveFrom.Format(domain.DateLayout)
		if err := json.Unmarshal([]byte(days), &p.Days); err != nil {
			return nil, fmt.Errorf("plan repository: decode days of %s: %w", p.ID, err)
		}
		plans = append(plans, p)
	}
	return plans, translate("plan repository: list rows", rows.Err())
}

func (r *PlanRepository) Delete(ctx context.Context, userID, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM workout.plans WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return translate("plan repository: delete", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("plan repository: delete %s: %w", id, domain.ErrNotFound)
	}
	return nil
}
