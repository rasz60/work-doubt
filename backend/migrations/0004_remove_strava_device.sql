-- 0004_remove_strava_device.sql — Strava 연동 · 폰 자동화(기기 토큰) 제거 (workout 스키마)
-- 0003 을 실행한 Supabase SQL Editor 에서 한 번 실행한다.
--
-- 순서: 이 마이그레이션을 쓰지 않는 새 백엔드를 **먼저 배포한 뒤** 실행한다.
--       (옛 백엔드는 아래에서 지우는 토큰 컬럼을 읽는다)
--
-- 되돌릴 수 없다: Strava 로 가져온 운동 기록(세트 포함)을 지운다. 필요하면 실행 전에 백업한다.
--   CREATE TABLE workout.sessions_strava_backup AS SELECT * FROM workout.sessions WHERE source = 'strava';
--
-- 남기는 것: 예전 폰 자동화로 들어온 기록(source = 'device'). 연결이 지워지면 connection_id 만 비워진다 (ON DELETE SET NULL)

BEGIN;

-- Strava 기록 삭제 (session_sets 는 ON DELETE CASCADE)
DELETE FROM workout.sessions WHERE source = 'strava';

-- Strava · 기기 토큰 연결 삭제
DELETE FROM workout.sync_connections WHERE provider IN ('strava', 'device');

-- Strava 토큰 · 기기 토큰 해시 컬럼 삭제 (ingest_token_hash 의 UNIQUE 인덱스도 함께 지워진다)
ALTER TABLE workout.sync_connections
    DROP COLUMN access_token,
    DROP COLUMN refresh_token,
    DROP COLUMN token_expires_at,
    DROP COLUMN ingest_token_hash;

ALTER TABLE workout.sync_connections DROP CONSTRAINT sync_connections_provider_check;
ALTER TABLE workout.sync_connections
    ADD CONSTRAINT sync_connections_provider_check CHECK (provider IN ('apple_health'));

ALTER TABLE workout.sessions DROP CONSTRAINT sessions_source_check;
ALTER TABLE workout.sessions
    ADD CONSTRAINT sessions_source_check CHECK (source IN ('manual', 'device', 'apple_health'));

COMMIT;
