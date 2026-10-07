package postgres

import (
	"context"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RefreshTokenRepository struct {
	pool *pgxpool.Pool
}

func NewRefreshTokenRepository(pool *pgxpool.Pool) *RefreshTokenRepository {
	return &RefreshTokenRepository{pool: pool}
}

var _ domain.RefreshTokenRepository = (*RefreshTokenRepository)(nil)

func (r *RefreshTokenRepository) Save(ctx context.Context, t *domain.RefreshToken) error {
	const q = `
		INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
		VALUES ($1, $2, $3, $4)`

	_, err := r.pool.Exec(ctx, q, t.ID, t.UserID, t.TokenHash, t.ExpiresAt)
	return translate("refresh token repository: save", err)
}

func (r *RefreshTokenRepository) FindValidByHash(ctx context.Context, hash string) (*domain.RefreshToken, error) {
	// idx_refresh_tokens_token_hash 유니크 인덱스 조회.
	const q = `
		SELECT id, user_id, token_hash, expires_at, revoked_at
		  FROM refresh_tokens
		 WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`

	var t domain.RefreshToken
	err := r.pool.QueryRow(ctx, q, hash).Scan(&t.ID, &t.UserID, &t.TokenHash, &t.ExpiresAt, &t.RevokedAt)
	if err != nil {
		return nil, translate("refresh token repository: find valid by hash", err)
	}
	return &t, nil
}

func (r *RefreshTokenRepository) Revoke(ctx context.Context, id string) error {
	const q = `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`

	_, err := r.pool.Exec(ctx, q, id)
	return translate("refresh token repository: revoke", err)
}

func (r *RefreshTokenRepository) RevokeAllByUser(ctx context.Context, userID string) error {
	const q = `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`

	_, err := r.pool.Exec(ctx, q, userID)
	return translate("refresh token repository: revoke all", err)
}
