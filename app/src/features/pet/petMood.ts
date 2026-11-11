// 펫의 기분은 앱이 이미 가진 "이번 주 운동 기록"에서만 정한다. 화면 · 네트워크와 무관한 순수 함수.

export type PetMood = 'cheer' | 'happy' | 'normal' | 'sleepy';

export interface PetInput {
  /** 오늘 한 운동이 있다 */
  doneToday: boolean;
  /** 오늘 계획이 있다 (휴식 아님) */
  plannedToday: boolean;
  /** 오늘 계획 이름 (러닝 · 웨이트) */
  plannedLabel?: string;
  /** 이번 주 운동한 날 수 */
  weekDone: number;
  /** 이번 주 계획한 날 수 (휴식 제외) */
  weekPlanned: number;
  /** 오늘 요일 1(월)~7(일) */
  weekday: number;
}

export interface PetState {
  mood: PetMood;
  /** 활력 하트 0~3 */
  hearts: number;
  say: string;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));

/** 이번 주 달성 비율 0~1: 계획이 있으면 계획 대비, 없으면 7일 중 3일을 꽉 찬 것으로 본다 */
export const weekRatio = (weekDone: number, weekPlanned: number): number =>
  weekPlanned > 0 ? clamp(weekDone / weekPlanned, 0, 1) : clamp(weekDone / 3, 0, 1);

export const petState = (i: PetInput): PetState => {
  const hearts = Math.ceil(weekRatio(i.weekDone, i.weekPlanned) * 3);

  if (i.doneToday) return { mood: 'cheer', hearts, say: '오늘 운동 완료! 최고예요.' };
  if (i.weekPlanned > 0 && i.weekDone >= i.weekPlanned) return { mood: 'happy', hearts, say: '이번 주 계획을 다 채웠어요.' };
  if (i.plannedToday) return { mood: 'normal', hearts, say: `오늘은 ${i.plannedLabel ?? '운동'} 하는 날이에요. 같이 해요.` };
  if (i.weekDone === 0) {
    return i.weekday >= 3
      ? { mood: 'sleepy', hearts, say: '이번 주엔 아직 운동 기록이 없어요. 가볍게 시작해 볼까요?' }
      : { mood: 'normal', hearts, say: '이번 주 첫 운동을 기다리고 있어요.' };
  }
  return { mood: hearts >= 2 ? 'happy' : 'normal', hearts, say: `이번 주 ${i.weekDone}일 운동했어요.` };
};

/** 게이지 칸 수: 비율 → 0..total 칸 (0보다 크면 최소 1칸) */
export const filledCells = (ratio: number, total: number): number => {
  const r = clamp(ratio, 0, 1);
  return r > 0 ? clamp(Math.round(r * total), 1, total) : 0;
};
