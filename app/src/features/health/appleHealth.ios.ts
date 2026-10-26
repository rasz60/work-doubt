import {
  isHealthDataAvailable,
  queryWorkoutSamples,
  requestAuthorization,
  WorkoutActivityType,
  type WorkoutProxyTyped,
} from '@kingstinct/react-native-healthkit';

import * as api from '@/api/endpoints';
import { toDateString } from '@/lib/date';
import type { ImportResult, IngestWorkout } from '@/types';

// iPhone 앱: Apple 건강(HealthKit)에서 운동을 읽어 서버(/sync/apple-health)로 보낸다.
// Apple Watch · 건강 앱 · 다른 운동 앱이 건강에 남긴 운동이 모두 들어온다. 이미 있는 기록은 서버가 건너뛴다.

const DAY = 24 * 60 * 60 * 1000;
const FIRST_LOOKBACK = 90 * DAY;
const RESYNC_OVERLAP = 3 * DAY; // 늦게 들어온 운동(워치 동기화 지연)도 다시 보낸다
const BATCH = 200; // 서버가 한 번에 받는 최대 개수

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate';

export const appleHealthSupported = isHealthDataAvailable();

// 서버는 type 으로 러닝 / 웨이트 / 기타를 나눈다 (KindFromType). title 은 기록 목록에 보이는 이름
const TYPES: Partial<Record<WorkoutActivityType, { type: string; title: string }>> = {
  [WorkoutActivityType.running]: { type: 'running', title: '러닝' },
  [WorkoutActivityType.traditionalStrengthTraining]: { type: 'strength', title: '근력 운동' },
  [WorkoutActivityType.functionalStrengthTraining]: { type: 'strength', title: '기능성 근력 운동' },
  [WorkoutActivityType.walking]: { type: 'walking', title: '걷기' },
  [WorkoutActivityType.hiking]: { type: 'hiking', title: '하이킹' },
  [WorkoutActivityType.cycling]: { type: 'cycling', title: '사이클' },
  [WorkoutActivityType.swimming]: { type: 'swimming', title: '수영' },
  [WorkoutActivityType.yoga]: { type: 'yoga', title: '요가' },
  [WorkoutActivityType.highIntensityIntervalTraining]: { type: 'hiit', title: 'HIIT' },
  [WorkoutActivityType.crossTraining]: { type: 'cross_training', title: '크로스 트레이닝' },
};

const meters = (q?: { unit: string; quantity: number }): number | undefined => {
  if (!q || !(q.quantity > 0)) return undefined;
  if (q.unit === 'km') return q.quantity * 1000;
  if (q.unit === 'mi') return q.quantity * 1609.344;
  return q.quantity; // HealthKit 기본 단위 m
};

const kcal = (q?: { unit: string; quantity: number }): number | undefined => {
  if (!q || !(q.quantity > 0)) return undefined;
  return q.unit === 'kJ' ? q.quantity / 4.184 : q.quantity; // kcal · Cal 은 같은 값
};

const avgHeartRate = async (w: WorkoutProxyTyped): Promise<number | undefined> => {
  try {
    const stat = await w.getStatistic(HEART_RATE, 'count/min');
    return stat?.averageQuantity?.quantity || undefined;
  } catch {
    return undefined; // 심박 권한이 없거나 기록이 없으면 빼고 보낸다
  }
};

const toIngest = async (w: WorkoutProxyTyped): Promise<IngestWorkout> => {
  const known = TYPES[w.workoutActivityType] ?? { type: 'other', title: '운동' };
  return {
    id: w.uuid,
    date: toDateString(w.startDate), // 폰의 현지 날짜 (새벽 운동이 UTC 로 전날이 되지 않게)
    start: w.startDate.toISOString(),
    type: known.type,
    title: known.title,
    distance_m: meters(w.totalDistance),
    duration_sec: w.duration.quantity > 0 ? w.duration.quantity : undefined,
    calories_kcal: kcal(w.totalEnergyBurned),
    avg_heart_rate: await avgHeartRate(w),
  };
};

const merge = (a: ImportResult, b: ImportResult): ImportResult => ({
  fetched: a.fetched + b.fetched,
  saved: a.saved + b.saved,
  duplicates: a.duplicates + b.duplicates,
  skipped: a.skipped + b.skipped,
  errors: [...(a.errors ?? []), ...(b.errors ?? [])].slice(0, 5),
});

const sendSince = async (since: Date): Promise<ImportResult> => {
  const samples = await queryWorkoutSamples({ limit: 0, ascending: true, filter: { date: { startDate: since } } });
  const workouts = await Promise.all(samples.map(toIngest));

  // 운동이 없어도 한 번은 보낸다: 서버가 연결을 만들고 마지막 동기화 시각을 남긴다
  let result = await api.sendAppleHealth(workouts.slice(0, BATCH));
  for (let i = BATCH; i < workouts.length; i += BATCH) {
    result = merge(result, await api.sendAppleHealth(workouts.slice(i, i + BATCH)));
  }
  return result;
};

export const connectAppleHealth = async (): Promise<ImportResult> => {
  if (!appleHealthSupported) throw new Error('이 기기에서는 Apple 건강을 쓸 수 없어요.');
  // 읽기 권한은 거절해도 iOS 가 알려 주지 않는다 (거절하면 운동이 0개로 보인다)
  await requestAuthorization({ toRead: ['HKWorkoutTypeIdentifier', HEART_RATE] });
  return sendSince(new Date(Date.now() - FIRST_LOOKBACK));
};

export const syncAppleHealth = async (lastSyncedAt?: string): Promise<ImportResult | null> => {
  if (!appleHealthSupported) return null;
  const since = lastSyncedAt ? new Date(new Date(lastSyncedAt).getTime() - RESYNC_OVERLAP) : new Date(Date.now() - FIRST_LOOKBACK);
  return sendSince(since);
};
