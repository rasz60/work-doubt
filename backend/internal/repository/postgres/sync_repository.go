package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/devsixt/workout/backend/internal/domain"
	"github.com/jackc/pgx/v5/pgxpool"
)

type SyncConnectionRepository struct {
	pool *pgxpool.Pool
}

func NewSyncConnectionRepository(pool *pgxpool.Pool) *SyncConnectionRepository {
	return &SyncConnectionRepository{pool: pool}
}

var _ domain.SyncConnectionRepository = (*SyncConnectionRepository)(nil)

const syncConnectionColumns = `id, user_id, provider, name, coalesce(external_account_id, ''),
	coalesce(access_token, ''), coalesce(refresh_token, ''), coalesce(token_expires_at, 'epoch'::timestamptz),
	last_synced_at, coalesce(last_error, ''), created_at`

func (r *SyncConnectionRepository) SaveOAuth(ctx context.Context, c *domain.SyncConnection) error {
	const q = `
		INSERT INTO workout.sync_connections
			(id, user_id, provider, name, external_account_id, access_token, refresh_token, token_expires_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (user_id, provider, external_account_id) DO UPDATE
		   SET name             = excluded.name,
		       access_token     = excluded.access_token,
		       refresh_token    = excluded.refresh_token,
		       token_expires_at = excluded.token_expires_at,
		       last_error       = NULL
		RETURNING id, created_at, last_synced_at`

	err := r.pool.QueryRow(ctx, q,
		c.ID, c.UserID, string(c.Provider), c.Name, c.ExternalAccountID, c.AccessToken, c.RefreshToken, c.TokenExpiresAt,
	).Scan(&c.ID, &c.CreatedAt, &c.LastSyncedAt)
	return translate("sync repository: save oauth", err)
}

func (r *SyncConnectionRepository) CreateDevice(ctx context.Context, c *domain.SyncConnection, tokenHash string) error {
	const q = `
		INSERT INTO workout.sync_connections (id, user_id, provider, name, ingest_token_hash)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING created_at`

	err := r.pool.QueryRow(ctx, q, c.ID, c.UserID, string(c.Provider), c.Name, tokenHash).Scan(&c.CreatedAt)
	return translate("sync repository: create device", err)
}

func (r *SyncConnectionRepository) List(ctx context.Context, userID string) ([]domain.SyncConnection, error) {
	// idx_sync_connections_user_created_at 를 탄다
	q := fmt.Sprintf(`SELECT %s FROM workout.sync_connections WHERE user_id = $1 ORDER BY created_at`, syncConnectionColumns)
	conns, err := r.query(ctx, "list", q, userID)
	if err != nil {
		return nil, err
	}
	// 목록은 화면에 나가므로 토큰을 비운다
	for i := range conns {
		conns[i].AccessToken, conns[i].RefreshToken = "", ""
	}
	return conns, nil
}

func (r *SyncConnectionRepository) Find(ctx context.Context, userID, id string) (*domain.SyncConnection, error) {
	q := fmt.Sprintf(`SELECT %s FROM workout.sync_connections WHERE id = $1 AND user_id = $2`, syncConnectionColumns)
	return r.one(ctx, "find", q, id, userID)
}

func (r *SyncConnectionRepository) FindByIngestHash(ctx context.Context, tokenHash string) (*domain.SyncConnection, error) {
	// ingest_token_hash 의 UNIQUE 인덱스를 탄다
	q := fmt.Sprintf(`SELECT %s FROM workout.sync_connections WHERE ingest_token_hash = $1`, syncConnectionColumns)
	return r.one(ctx, "find by ingest hash", q, tokenHash)
}

func (r *SyncConnectionRepository) UpdateTokens(ctx context.Context, id, accessToken, refreshToken string, expiresAt time.Time) error {
	const q = `
		UPDATE workout.sync_connections
		   SET access_token = $2, refresh_token = $3, token_expires_at = $4
		 WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, id, accessToken, refreshToken, expiresAt)
	return translate("sync repository: update tokens", err)
}

func (r *SyncConnectionRepository) MarkSynced(ctx context.Context, id string, at time.Time, syncErr string) error {
	const q = `UPDATE workout.sync_connections SET last_synced_at = $2, last_error = nullif($3, '') WHERE id = $1`
	_, err := r.pool.Exec(ctx, q, id, at, syncErr)
	return translate("sync repository: mark synced", err)
}

func (r *SyncConnectionRepository) Delete(ctx context.Context, userID, id string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM workout.sync_connections WHERE id = $1 AND user_id = $2`, id, userID)
	if err != nil {
		return translate("sync repository: delete", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("sync repository: delete %s: %w", id, domain.ErrNotFound)
	}
	return nil
}

func (r *SyncConnectionRepository) one(ctx context.Context, op, q string, args ...any) (*domain.SyncConnection, error) {
	conns, err := r.query(ctx, op, q, args...)
	if err != nil {
		return nil, err
	}
	if len(conns) == 0 {
		return nil, fmt.Errorf("sync repository: %s: %w", op, domain.ErrNotFound)
	}
	return &conns[0], nil
}

func (r *SyncConnectionRepository) query(ctx context.Context, op, q string, args ...any) ([]domain.SyncConnection, error) {
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, translate("sync repository: "+op, err)
	}
	defer rows.Close()

	conns := make([]domain.SyncConnection, 0, 4)
	for rows.Next() {
		var c domain.SyncConnection
		var provider string
		if err := rows.Scan(
			&c.ID, &c.UserID, &provider, &c.Name, &c.ExternalAccountID,
			&c.AccessToken, &c.RefreshToken, &c.TokenExpiresAt,
			&c.LastSyncedAt, &c.LastError, &c.CreatedAt,
		); err != nil {
			return nil, translate("sync repository: "+op+" scan", err)
		}
		c.Provider = domain.SyncProvider(provider)
		conns = append(conns, c)
	}
	return conns, translate("sync repository: "+op+" rows", rows.Err())
}
