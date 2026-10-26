import type { ImportResult } from '@/types';

// Apple 건강(HealthKit)은 iPhone 앱에서만 읽을 수 있다. 실제 구현은 appleHealth.ios.ts (Metro 가 iOS 에서 그 파일을 고른다).
// 웹 · Android 는 이 파일을 쓴다: 연결 버튼을 숨기고, 부르면 아무것도 하지 않는다.

/** 이 기기에서 Apple 건강을 읽을 수 있는지 */
export const appleHealthSupported = false;

/** 읽기 권한을 묻고 최근 90일 운동을 보낸다 */
export const connectAppleHealth = async (): Promise<ImportResult> => {
  throw new Error('Apple 건강은 iPhone 앱에서만 연결할 수 있어요.');
};

/** lastSyncedAt 3일 전(없으면 90일 전)부터의 운동을 보낸다 */
export const syncAppleHealth = async (_lastSyncedAt?: string): Promise<ImportResult | null> => null;
