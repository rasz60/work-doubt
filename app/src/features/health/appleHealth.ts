import type { ImportResult, IngestWorkout } from '@/types';

import { FIRST_LOOKBACK, sendWorkouts, syncStart } from './send';

// 웹 · Android 는 이 파일을 쓴다 (iPhone 앱은 appleHealth.ios.ts 를 Metro 가 고른다).
// 웹이 ae:p 앱(포털 저장소 mobile/) 안에서 열리면 window.aepNative 로 Apple 건강을 읽을 수 있다.
// 그 밖(브라우저 · PWA · Android)에서는 연결 버튼을 숨기고, 불러도 아무것도 하지 않는다.

interface AepNative {
  features?: { health?: boolean };
  call: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

const native = (): AepNative | undefined =>
  typeof window === 'undefined' ? undefined : (window as unknown as { aepNative?: AepNative }).aepNative;

/** 이 기기에서 Apple 건강을 읽을 수 있는지 (ae:p 앱이 페이지보다 먼저 aepNative 를 넣는다) */
export const appleHealthSupported = !!native()?.features?.health;

const readSince = async (since: Date): Promise<IngestWorkout[]> =>
  (await native()!.call('health.workouts', { since: since.toISOString() })) as IngestWorkout[];

/** 읽기 권한을 묻고 최근 90일 운동을 보낸다 */
export const connectAppleHealth = async (): Promise<ImportResult> => {
  if (!appleHealthSupported) throw new Error('Apple 건강은 iPhone 의 ae:p 앱에서 연결할 수 있어요.');
  // 읽기 권한은 거절해도 iOS 가 알려 주지 않는다 (거절하면 운동이 0개로 보인다)
  await native()!.call('health.authorize');
  return sendWorkouts(await readSince(new Date(Date.now() - FIRST_LOOKBACK)));
};

/** lastSyncedAt 3일 전(없으면 90일 전)부터의 운동을 보낸다 */
export const syncAppleHealth = async (lastSyncedAt?: string): Promise<ImportResult | null> => {
  if (!appleHealthSupported) return null;
  return sendWorkouts(await readSince(syncStart(lastSyncedAt)));
};
