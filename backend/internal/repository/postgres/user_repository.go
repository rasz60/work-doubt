package postgres

import (
	"context"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

// UserRepository 는 workout.profiles (auth.users 와 1:1) 를 다룬다.
type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

var _ domain.UserRepository = (*UserRepository)(nil)

func (r *UserRepository) Ensure(ctx context.Context, id, email, displayName string) error {
	const q = `
		INSERT INTO workout.profiles (id, email, display_name)
		VALUES ($1, nullif($2, ''), $3)
		ON CONFLICT (id) DO UPDATE
		   SET email = coalesce(excluded.email, workout.profiles.email)
		 WHERE workout.profiles.email IS DISTINCT FROM coalesce(excluded.email, workout.profiles.email)`

	_, err := r.pool.Exec(ctx, q, id, email, displayName)
	return translate("user repository: ensure", err)
}

func (r *UserRepository) Update(ctx context.Context, u *domain.User) error {
	const q = `
		UPDATE workout.profiles
		   SET display_name = $2,
		       avatar_url   = nullif($3, ''),
		       height_cm    = $4,
		       updated_at   = now()
		 WHERE id = $1
		RETURNING updated_at`

	err := r.pool.QueryRow(ctx, q, u.ID, u.DisplayName, u.AvatarURL, u.HeightCm).Scan(&u.UpdatedAt)
	return translate("user repository: update", err)
}

func (r *UserRepository) FindByID(ctx context.Context, id string) (*domain.User, error) {
	const q = `
		SELECT id, coalesce(email, ''), display_name, coalesce(avatar_url, ''), height_cm, created_at, updated_at
		  FROM workout.profiles
		 WHERE id = $1`

	var u domain.User
	err := r.pool.QueryRow(ctx, q, id).Scan(&u.ID, &u.Email, &u.DisplayName, &u.AvatarURL, &u.HeightCm, &u.CreatedAt, &u.UpdatedAt)
	if err != nil {
		return nil, translate("user repository: find by id", err)
	}
	return &u, nil
}
