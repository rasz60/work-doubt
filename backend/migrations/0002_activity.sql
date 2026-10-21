-- 0002_activity.sql — 운동 계획 · 수행 기록 · 기기 연동 (workout 스키마)
-- 0001 을 실행한 Supabase SQL Editor 에서 한 번 실행한다. 0001 과 마찬가지로 Go 백엔드만 읽고 쓴다.
-- 명명 규칙: snake_case, 시각은 timestamptz, 날짜(운동한 날 · 계획 시작일)는 date.

BEGIN;

-- ─────────────────────────── 기기 · 앱 연동 ───────────────────────────
-- provider
--   strava : OAuth 로 연결해 서버가 활동을 가져온다 (Garmin · Samsung Health · Apple Watch 앱 등이 Strava 로 올린다)
--   device : 연결마다 발급한 토큰으로 폰 자동화(iOS 단축어 등)가 기록을 보낸다. 토큰 원문은 저장하지 않고 sha256 만 둔다

CREATE TABLE workout.sync_connections (
    id                  uuid PRIMARY KEY,
    user_id             uuid NOT NULL REFERENCES workout.profiles (id) ON DELETE CASCADE,
    provider            text NOT NULL CHECK (provider IN ('strava', 'device')),
    name                text NOT NULL,
    external_account_id text,                 -- strava: athlete id (다시 연결하면 같은 행의 토큰만 바꾼다)
    access_token        text,
    refresh_token       text,
    token_expires_at    timestamptz,
    ingest_token_hash   text UNIQUE,          -- device: sha256(토큰) hex. 들어온 요청의 토큰으로 연결을 찾는다
    last_synced_at      timestamptz,
    last_error          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_sync_connections_user_provider_account UNIQUE (user_id, provider, external_account_id)
);

-- PROFILE 의 "연결된 기기" 목록
CREATE INDEX idx_sync_connections_user_created_at ON workout.sync_connections (user_id, created_at);

-- ─────────────────────────── 운동 계획 (주간 루틴) ───────────────────────────
-- 계획은 고칠 때마다 새 버전(effective_from)을 만든다. 지난 날짜의 잔디는 그날 적용되던 계획으로 채점한다.
-- days(jsonb): 요일(1=월 … 7=일)마다 { kind: run|weight|rest, distance_km, pace_sec_per_km, exercises[], target_kcal }
--   형식은 Go domain.PlanDay 가 정한다. 계획은 한 덩어리로 읽고 쓰므로 표로 쪼개지 않는다

CREATE TABLE workout.plans (
    id             uuid PRIMARY KEY,
    user_id        uuid NOT NULL REFERENCES workout.profiles (id) ON DELETE CASCADE,
    effective_from date NOT NULL,
    title          text NOT NULL DEFAULT '',
    days           jsonb NOT NULL DEFAULT '[]'::jsonb,
    created_at     timestamptz NOT NULL DEFAULT now(),
    -- 같은 날짜에 다시 저장하면 그 버전을 덮어쓴다. "사용자의 계획 이력" 조회 인덱스도 겸한다
    CONSTRAINT uq_plans_user_effective_from UNIQUE (user_id, effective_from)
);

-- ─────────────────────────── 수행 기록 ───────────────────────────
-- 러닝: 거리 · 시간 / 웨이트: 세트(session_sets) / 기타: 시간
-- 연동으로 들어온 기록은 (user_id, source, external_id) 로 중복을 막는다 (직접 입력은 external_id 가 NULL)

CREATE TABLE workout.sessions (
    id             uuid PRIMARY KEY,
    user_id        uuid NOT NULL REFERENCES workout.profiles (id) ON DELETE CASCADE,
    performed_on   date NOT NULL,
    kind           text NOT NULL CHECK (kind IN ('run', 'weight', 'other')),
    title          text NOT NULL DEFAULT '',
    distance_km    numeric(6, 2) CHECK (distance_km > 0 AND distance_km < 1000),
    duration_sec   integer CHECK (duration_sec > 0 AND duration_sec <= 172800),
    calories_kcal  integer CHECK (calories_kcal >= 0 AND calories_kcal < 20000),
    avg_heart_rate integer CHECK (avg_heart_rate > 0 AND avg_heart_rate < 300),
    memo           text,
    source         text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'strava', 'device')),
    connection_id  uuid REFERENCES workout.sync_connections (id) ON DELETE SET NULL, -- 연결을 끊어도 기록은 남긴다
    external_id    text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_sessions_user_source_external UNIQUE (user_id, source, external_id)
);

-- 잔디 · 통계 · 기록 목록의 주 쿼리: user_id 로 좁히고 performed_on 범위를 스캔한다
CREATE INDEX idx_sessions_user_performed_on ON workout.sessions (user_id, performed_on DESC);
-- 연결을 끊을 때 ON DELETE SET NULL 이 쓰는 FK 인덱스
CREATE INDEX idx_sessions_connection_id ON workout.sessions (connection_id) WHERE connection_id IS NOT NULL;

CREATE TABLE workout.session_sets (
    id         uuid PRIMARY KEY,
    session_id uuid NOT NULL REFERENCES workout.sessions (id) ON DELETE CASCADE,
    position   smallint NOT NULL,
    exercise   text NOT NULL,
    weight_kg  numeric(6, 2) CHECK (weight_kg >= 0 AND weight_kg < 1000),
    reps       integer NOT NULL CHECK (reps > 0 AND reps < 1000),
    -- 세션의 세트를 순서대로 읽는 인덱스를 겸한다
    CONSTRAINT uq_session_sets_session_position UNIQUE (session_id, position)
);

-- ─────────────────────── 브라우저 쪽 접근 차단 (0001 과 같은 방식) ───────────────────────

ALTER TABLE workout.sync_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout.plans            ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout.sessions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout.session_sets     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA workout FROM anon, authenticated;

COMMIT;
