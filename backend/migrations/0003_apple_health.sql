-- 0003_apple_health.sql — iPhone 앱의 Apple 건강(HealthKit) 연동 (workout 스키마)
-- 0002 를 실행한 Supabase SQL Editor 에서 한 번 실행한다.
--
-- provider / source
--   apple_health : iPhone 앱이 HealthKit 에서 운동을 읽어 로그인 토큰으로 보낸다. 사용자마다 연결 하나
--                  (external_account_id = 'apple_health' 로 고정해 다시 연결해도 같은 행을 쓴다)

BEGIN;

ALTER TABLE workout.sync_connections DROP CONSTRAINT sync_connections_provider_check;
ALTER TABLE workout.sync_connections
    ADD CONSTRAINT sync_connections_provider_check CHECK (provider IN ('strava', 'device', 'apple_health'));

ALTER TABLE workout.sessions DROP CONSTRAINT sessions_source_check;
ALTER TABLE workout.sessions
    ADD CONSTRAINT sessions_source_check CHECK (source IN ('manual', 'strava', 'device', 'apple_health'));

COMMIT;
