import type { SessionPayload } from '@/api/endpoints';
import type { PlanDay } from '@/types';

import { blocksForSession, setsFromBlocks } from './exercises';

/**
 * "계획대로 완료": 그날 계획을 그대로 기록으로 만든다 (입력 없이 버튼 한 번).
 * - 러닝: 계획 거리만 넣는다. 시간은 지어내지 않는다 (페이스 목표로 시간을 채우면 실제와 다른 기록이 된다)
 * - 웨이트: 계획한 종목 · 무게 · 횟수 · 세트 그대로
 * 계획이 기록으로 만들 수 없는 모양이면(거리 없는 러닝 · 종목 없는 웨이트) undefined → 입력 화면으로 보낸다
 */
export const sessionFromPlan = (date: string, planned?: PlanDay): SessionPayload | undefined => {
  if (!planned || planned.kind === 'rest') return undefined;
  if (planned.kind === 'run') {
    if (!planned.distance_km) return undefined;
    return { performed_on: date, kind: 'run', distance_km: planned.distance_km };
  }
  let sets;
  try {
    sets = setsFromBlocks(blocksForSession(planned.exercises ?? []));
  } catch {
    return undefined; // 계획에 빠진 값이 있으면 입력 화면에서 채우게 한다
  }
  if (sets.length === 0) return undefined;
  return { performed_on: date, kind: 'weight', sets };
};
