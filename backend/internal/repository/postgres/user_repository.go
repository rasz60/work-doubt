package postgres

import (
	"context"
	"fmt"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

const userColumns = `id, email, display_name, coalesce(avatar_url, ''), height_cm,
	coalesce(password_hash, ''), created_at, updated_at`

type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

var _ domain.UserRepository = (*UserRepository)(nil)

func (r *UserRepository) Create(ctx context.Context, u *domain.User) error {
	const q = `
		INSERT INTO users (id, email, display_name, avatar_url, height_cm, password_hash)
		VALUES ($1, nullif($2, ''), $3, nullif($4, ''), $5, nullif($6, ''))
		RETURNING created_at, updated_at`

	err := r.pool.QueryRow(ctx, q, u.ID, u.Email, u.DisplayName, u.AvatarURL, u.HeightCm, u.PasswordHash).
		Scan(&u.CreatedAt, &u.UpdatedAt)
	return translate("user repository: create", err)
}

func (r *UserRepository) Update(ctx context.Context, u *domain.User) error {
	const q = `
		UPDATE users
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
	q := fmt.Sprintf(`SELECT %s FROM users WHERE id = $1`, userColumns)
	return r.scanOne(ctx, "user repository: find by id", q, id)
}

func (r *UserRepository) FindByEmail(ctx context.Context, email string) (*domain.User, error) {
	q := fmt.Sprintf(`SELECT %s FROM users WHERE email = $1`, userColumns)
	return r.scanOne(ctx, "user repository: find by email", q, email)
}

func (r *UserRepository) FindByIdentity(ctx context.Context, provider domain.Provider, providerUserID string) (*domain.User, error) {
	// idx_user_identities_provider (provider, provider_user_id) 유니크 인덱스를 탄다.
	q := fmt.Sprintf(`
		SELECT %s
		  FROM users u
		  JOIN user_identities i ON i.user_id = u.id
		 WHERE i.provider = $1 AND i.provider_user_id = $2`, prefixColumns("u"))

	return r.scanOne(ctx, "user repository: find by identity", q, string(provider), providerUserID)
}

func (r *UserRepository) LinkIdentity(ctx context.Context, userID string, identity domain.Identity) error {
	const q = `
		INSERT INTO user_identities (id, user_id, provider, provider_user_id, email)
		VALUES (gen_random_uuid(), $1, $2, $3, nullif($4, ''))
		ON CONFLICT (provider, provider_user_id) DO NOTHING`

	_, err := r.pool.Exec(ctx, q, userID, string(identity.Provider), identity.ProviderUserID, identity.Email)
	return translate("user repository: link identity", err)
}

func (r *UserRepository) scanOne(ctx context.Context, op, query string, args ...any) (*domain.User, error) {
	var u domain.User
	var email *string

	err := r.pool.QueryRow(ctx, query, args...).Scan(
		&u.ID, &email, &u.DisplayName, &u.AvatarURL, &u.HeightCm,
		&u.PasswordHash, &u.CreatedAt, &u.UpdatedAt,
	)
	if err != nil {
		return nil, translate(op, err)
	}
	if email != nil {
		u.Email = *email
	}
	return &u, nil
}

// prefixColumns 는 조인 쿼리에서 테이블 별칭을 붙인 컬럼 목록을 만든다.
func prefixColumns(alias string) string {
	return fmt.Sprintf(`%[1]s.id, %[1]s.email, %[1]s.display_name, coalesce(%[1]s.avatar_url, ''), %[1]s.height_cm,
		coalesce(%[1]s.password_hash, ''), %[1]s.created_at, %[1]s.updated_at`, alias)
}
