-- 0001_init.sql — 운동 기록 앱 초기 스키마
-- 명명 규칙: 테이블/컬럼 모두 snake_case, 시각은 timestamptz.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ─────────────────────────────── 계정 ───────────────────────────────

CREATE TABLE users (
    id            uuid PRIMARY KEY,
    email         text UNIQUE,                  -- 소셜 전용 계정은 NULL 가능
    display_name  text NOT NULL,
    avatar_url    text,
    height_cm     numeric(5, 1) CHECK (height_cm > 0 AND height_cm < 300),
    password_hash text,                         -- 소셜 전용 계정은 NULL
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_identities (
    id               uuid PRIMARY KEY,
    user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider         text NOT NULL CHECK (provider IN ('local', 'google', 'kakao', 'naver')),
    provider_user_id text NOT NULL,
    email            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_user_identities_provider UNIQUE (provider, provider_user_id)
);

-- 소셜 로그인은 (provider, provider_user_id) 로만 조회하므로 위 UNIQUE 가 그 인덱스를 겸한다.
CREATE INDEX idx_user_identities_user_id ON user_identities (user_id);

CREATE TABLE refresh_tokens (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,            -- sha256 해시만 저장
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- 폐기/만료 정리 및 사용자별 전체 폐기용 부분 인덱스.
CREATE INDEX idx_refresh_tokens_user_active
    ON refresh_tokens (user_id)
    WHERE revoked_at IS NULL;

-- ─────────────────────────── 그룹 / 데이터 공유 ───────────────────────────

CREATE TABLE groups (
    id          uuid PRIMARY KEY,
    name        text NOT NULL,
    owner_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    invite_code text NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE group_members (
    group_id   uuid NOT NULL REFERENCES groups (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    share_data boolean NOT NULL DEFAULT true,   -- false 면 내 지표를 그룹에 노출하지 않음
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

-- "내가 속한 그룹" 조회와 공유 권한 검사(SharesWith) 양쪽에서 쓰인다.
CREATE INDEX idx_group_members_user_id ON group_members (user_id, group_id);

-- ─────────────────────────── 신체 지표 / 차트 ───────────────────────────

CREATE TABLE body_metrics (
    id                  uuid PRIMARY KEY,
    user_id             uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    measured_at         date NOT NULL,
    height_cm           numeric(5, 1) CHECK (height_cm > 0 AND height_cm < 300),
    weight_kg           numeric(5, 1) CHECK (weight_kg > 0 AND weight_kg < 500),
    skeletal_muscle_kg  numeric(5, 1) CHECK (skeletal_muscle_kg > 0 AND skeletal_muscle_kg < 150),
    body_fat_percentage numeric(4, 1) CHECK (body_fat_percentage > 0 AND body_fat_percentage < 80),
    -- BMI 는 입력값이 아니라 파생값이다. 저장 시점에 계산해 두고 차트에서 그대로 읽는다.
    bmi                 numeric(5, 2) GENERATED ALWAYS AS (
                            CASE
                                WHEN height_cm IS NULL OR weight_kg IS NULL THEN NULL
                                ELSE round(weight_kg / ((height_cm / 100) ^ 2), 2)
                            END
                        ) STORED,
    memo                text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_body_metrics_user_day UNIQUE (user_id, measured_at)
);

-- 변동폭 차트의 주 쿼리: user_id 로 좁히고 measured_at 범위를 스캔한다.
-- UNIQUE(user_id, measured_at) 가 오름차순이라 DESC 전용 인덱스를 따로 둔다(Latest 조회).
CREATE INDEX idx_body_metrics_user_measured_at_desc
    ON body_metrics (user_id, measured_at DESC);

-- ─────────────────────────── AI 코치 대화 ───────────────────────────

CREATE TABLE coach_conversations (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    title      text NOT NULL,
    goal       text CHECK (goal IN ('fat_loss', 'muscle_gain', 'endurance', 'maintenance', 'rehab')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_conversations_user_updated_at
    ON coach_conversations (user_id, updated_at DESC);

CREATE TABLE coach_messages (
    id              uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES coach_conversations (id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    content         text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- 대화 히스토리는 항상 conversation_id + 시간순으로 읽는다.
CREATE INDEX idx_coach_messages_conversation_created_at
    ON coach_messages (conversation_id, created_at);

-- ─────────────────────── Supabase 노출 차단 (중요) ───────────────────────
-- Supabase 는 public 스키마의 테이블을 PostgREST 로 자동 노출하고,
-- 기본 권한 때문에 새 테이블이 anon / authenticated 역할에 그대로 열린다.
-- 이 앱은 Supabase Auth 나 PostgREST 를 쓰지 않고 Go 백엔드가 postgres 역할로만
-- 접속하므로, 두 역할의 접근을 완전히 막는다.
--   1) RLS 를 켜고 정책을 하나도 만들지 않는다 → anon / authenticated 는 0행
--   2) 테이블 권한 자체를 회수한다 → REST 호출이 권한 오류로 끊긴다
-- postgres 역할은 BYPASSRLS 라 백엔드 동작에는 영향이 없다.
-- (로컬 Docker Postgres 에는 anon / authenticated 역할이 없으므로 존재 확인 후 실행한다.)

DO $$
DECLARE
    t text;
BEGIN
    FOR t IN
        SELECT unnest(ARRAY[
            'users', 'user_identities', 'refresh_tokens',
            'groups', 'group_members', 'body_metrics',
            'coach_conversations', 'coach_messages'
        ])
    LOOP
        -- FORCE 는 쓰지 않는다. FORCE 를 걸면 테이블 소유자(postgres)까지
        -- 정책 검사를 받게 되어, BYPASSRLS 가 없는 역할로 접속하면 백엔드가 0행만 보게 된다.
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon';
    END IF;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated';
        EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated';
    END IF;
END $$;

COMMIT;
