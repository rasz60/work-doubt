import * as api from '@/api/endpoints';
import type { ImportResult, IngestWorkout } from '@/types';

// Apple 건강 운동을 서버(/sync/apple-health)로 보낸다. 읽는 쪽은 둘:
// 운동기록 iPhone 앱(appleHealth.ios.ts) · ae:p 앱 안의 웹(appleHealth.ts, window.aepNative 로 읽는다)

const DAY = 24 * 60 * 60 * 1000;
export const FIRST_LOOKBACK = 90 * DAY;
const RESYNC_OVERLAP = 3 * DAY; // 늦게 들어온 운동(워치 동기화 지연)도 다시 보낸다
const BATCH = 200; // 서버가 한 번에 받는 최대 개수

/** 마지막 동기화 3일 전부터, 처음이면 90일 전부터 */
export const syncStart = (lastSyncedAt?: string): Date =>
  lastSyncedAt ? new Date(new Date(lastSyncedAt).getTime() - RESYNC_OVERLAP) : new Date(Date.now() - FIRST_LOOKBACK);

const merge = (a: ImportResult, b: ImportResult): ImportResult => ({
  fetched: a.fetched + b.fetched,
  saved: a.saved + b.saved,
  duplicates: a.duplicates + b.duplicates,
  skipped: a.skipped + b.skipped,
  errors: [...(a.errors ?? []), ...(b.errors ?? [])].slice(0, 5),
});

/** 운동이 없어도 한 번은 보낸다: 서버가 연결을 만들고 마지막 동기화 시각을 남긴다 */
export const sendWorkouts = async (workouts: IngestWorkout[]): Promise<ImportResult> => {
  let result = await api.sendAppleHealth(workouts.slice(0, BATCH));
  for (let i = BATCH; i < workouts.length; i += BATCH) {
    result = merge(result, await api.sendAppleHealth(workouts.slice(i, i + BATCH)));
  }
  return result;
};
