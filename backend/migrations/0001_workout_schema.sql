-- 0001_workout_schema.sql — 운동기록 스키마 (ae:p 공용 Supabase 프로젝트의 workout 스키마)
-- Supabase SQL Editor 에서 한 번 실행한다. 업무일지(public 스키마)는 건드리지 않는다.
--
-- 계정은 Supabase Auth(auth.users)를 쓴다. 로그인·가입·소셜 연결은 ae:p 포털이 하고,
-- 여기에는 앱 전용 프로필만 둔다 (Go 백엔드가 처음 들어온 사용자의 프로필을 자동으로 만든다).
-- 명명 규칙: 테이블/컬럼 모두 snake_case, 시각은 timestamptz, 측정일만 date.

BEGIN;

CREATE SCHEMA IF NOT EXISTS workout;

-- ─────────────────────────────── 프로필 ───────────────────────────────

CREATE TABLE workout.profiles (
    id           uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE, -- 포털에서 계정을 지우면 운동 데이터도 지워진다
    email        text,
    display_name text NOT NULL,
    avatar_url   text,
    height_cm    numeric(5, 1) CHECK (height_cm > 0 AND height_cm < 300),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────── 그룹 / 데이터 공유 ───────────────────────────

CREATE TABLE workout.groups (
    id          uuid PRIMARY KEY,
    name        text NOT NULL,
    owner_id    uuid NOT NULL REFERENCES workout.profiles (id) ON DELETE CASCADE,
    invite_code text NOT NULL UNIQUE,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workout.group_members (
    group_id   uuid NOT NULL REFERENCES workout.groups (id) ON DELETE CASCADE,
    user_id    uuid NOT NULL REFERENCES workout.profiles (id) ON DELETE CASCADE,
    role       text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    share_data boolean NOT NULL DEFAULT true,   -- false 면 내 지표를 그룹에 노출하지 않음
    joined_at  timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (group_id, user_id)
);

-- "내가 속한 그룹" 조회와 공유 권한 검사(SharesWith) 양쪽에서 쓰인다.
CREATE INDEX idx_group_members_user_id ON workout.group_members (user_id, group_id);

-- ─────────────────────────── 신체 지표 / 차트 ───────────────────────────

CREATE TABLE workout.body_metrics (
    id                  uuid PRIMARY KEY,
    user_id             uuid NOT NULL REFERENCES workout.profiles (id) ON DELETE CASCADE,
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
    ON workout.body_metrics (user_id, measured_at DESC);

-- ─────────────────────────── AI 코치 대화 ───────────────────────────

CREATE TABLE workout.coach_conversations (
    id         uuid PRIMARY KEY,
    user_id    uuid NOT NULL REFERENCES workout.profiles (id) ON DELETE CASCADE,
    title      text NOT NULL,
    goal       text CHECK (goal IN ('fat_loss', 'muscle_gain', 'endurance', 'maintenance', 'rehab')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coach_conversations_user_updated_at
    ON workout.coach_conversations (user_id, updated_at DESC);

CREATE TABLE workout.coach_messages (
    id              uuid PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES workout.coach_conversations (id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user', 'assistant')),
    content         text NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- 대화 히스토리는 항상 conversation_id + 시간순으로 읽는다.
CREATE INDEX idx_coach_messages_conversation_created_at
    ON workout.coach_messages (conversation_id, created_at);

-- ─────────────────────── 브라우저 쪽 접근 차단 (중요) ───────────────────────
-- 이 스키마는 Go 백엔드만 postgres 역할(풀러)로 읽고 쓴다. 브라우저의 anon/authenticated 키로는 못 보게 막는다.
--   1) RLS 를 켜고 정책을 하나도 만들지 않는다 → anon / authenticated 는 0행
--   2) 스키마·테이블 권한을 회수한다
--   3) Supabase API 설정의 Exposed schemas 에 workout 을 넣지 않는다 (REST 로 노출되지 않음)
-- FORCE ROW LEVEL SECURITY 는 쓰지 않는다 — 소유자(postgres)까지 정책 검사를 받아 백엔드가 0행만 보게 된다.
-- ⚠️ public 스키마는 건드리지 않는다 (업무일지가 RLS 정책으로 쓰고 있다).

ALTER TABLE workout.profiles            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout.groups              ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout.group_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout.body_metrics        ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout.coach_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout.coach_messages      ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON SCHEMA workout FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA workout FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA workout REVOKE ALL ON TABLES FROM anon, authenticated;

COMMIT;
