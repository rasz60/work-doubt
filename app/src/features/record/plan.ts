import type { SavePlanPayload } from '@/api/endpoints';
import { isDateString, isoWeekday, parsePace, toNumber, weekdayLabel, formatPace } from '@/lib/date';
import type { Plan, PlanDay, PlanKind } from '@/types';

// 계획 편집 화면의 입력 상태(문자열)와 서버 형식(PlanDay) 사이를 오간다.

export interface ExerciseDraft {
  name: string;
  sets: string;
  reps: string;
  weight: string;
}

export interface DayDraft {
  weekday: number;
  kind: PlanKind;
  distance: string;
  pace: string;
  targetKcal: string;
  exercises: ExerciseDraft[];
}

export interface PlanDraft {
  effectiveFrom: string;
  title: string;
  days: DayDraft[];
}

const str = (n?: number): string => (n === undefined || n === null ? '' : String(n));

export const emptyExercise = (): ExerciseDraft => ({ name: '', sets: '3', reps: '10', weight: '' });

const emptyDay = (weekday: number): DayDraft => ({ weekday, kind: 'rest', distance: '', pace: '', targetKcal: '', exercises: [] });

export const toDraft = (effectiveFrom: string, plan?: Plan): PlanDraft => ({
  effectiveFrom,
  title: plan?.title ?? '',
  days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => {
    const day = plan?.days.find((d) => d.weekday === weekday);
    if (!day) return emptyDay(weekday);
    return {
      weekday,
      kind: day.kind,
      distance: str(day.distance_km),
      pace: day.pace_sec_per_km ? formatPace(day.pace_sec_per_km).replace(`'`, ':').replace('"', '') : '',
      targetKcal: str(day.target_kcal),
      exercises: (day.exercises ?? []).map((e) => ({ name: e.name, sets: str(e.sets), reps: str(e.reps), weight: str(e.weight_kg) })),
    };
  }),
});

/** 사용자가 말한 예시 루틴: 월 · 수 · 금 러닝, 토 · 일 웨이트 */
export const examplePlan = (effectiveFrom: string): PlanDraft => {
  const run = (weekday: number): DayDraft => ({ ...emptyDay(weekday), kind: 'run', distance: '5', pace: '6:00' });
  const lift = (weekday: number, exercises: [string, number, number][]): DayDraft => ({
    ...emptyDay(weekday),
    kind: 'weight',
    exercises: exercises.map(([name, sets, reps]) => ({ name, sets: String(sets), reps: String(reps), weight: '' })),
  });
  return {
    effectiveFrom,
    title: '러닝 3 · 웨이트 2',
    days: [
      run(1),
      emptyDay(2),
      run(3),
      emptyDay(4),
      run(5),
      lift(6, [['스쿼트', 5, 5], ['벤치프레스', 5, 5], ['바벨 로우', 5, 5]]),
      lift(7, [['데드리프트', 3, 5], ['오버헤드 프레스', 5, 5], ['풀업', 3, 8]]),
    ],
  };
};

const toInt = (value: string): number | undefined => {
  const n = toNumber(value);
  return n === undefined ? undefined : Math.round(n);
};

/** 입력을 서버 형식으로 바꾼다. 형식이 틀린 칸이 있으면 화면에 보여 줄 문장을 던진다 */
export const fromDraft = (draft: PlanDraft): SavePlanPayload => {
  if (!isDateString(draft.effectiveFrom)) throw new Error('적용 시작일은 2026-10-21 처럼 입력하세요.');

  const days: PlanDay[] = draft.days.map((d) => {
    const label = `${weekdayLabel(d.weekday)}요일`;
    const day: PlanDay = { weekday: d.weekday, kind: d.kind };
    if (d.kind === 'rest') return day;

    const kcal = toInt(d.targetKcal);
    if (d.targetKcal.trim() && kcal === undefined) throw new Error(`${label} 목표 칼로리는 숫자로 입력하세요.`);
    day.target_kcal = kcal;

    if (d.kind === 'run') {
      day.distance_km = toNumber(d.distance);
      if (d.distance.trim() && day.distance_km === undefined) throw new Error(`${label} 목표 거리는 숫자(km)로 입력하세요.`);
      day.pace_sec_per_km = parsePace(d.pace);
      if (d.pace.trim() && day.pace_sec_per_km === undefined) throw new Error(`${label} 페이스는 5:30 처럼 입력하세요.`);
      return day;
    }

    day.exercises = d.exercises
      .filter((e) => e.name.trim() || e.weight.trim())
      .map((e) => {
        const name = e.name.trim();
        if (!name) throw new Error(`${label} 루틴에 종목 이름이 빠진 줄이 있습니다.`);
        const sets = toInt(e.sets);
        const reps = toInt(e.reps);
        if (!sets || !reps) throw new Error(`${label} ${name}의 세트 · 횟수를 숫자로 입력하세요.`);
        return { name, sets, reps, weight_kg: toNumber(e.weight) };
      });
    return day;
  });

  return { effective_from: draft.effectiveFrom, title: draft.title.trim(), days };
};

/** date 에 적용되는 계획의 그 요일 (쉬는 날이면 undefined). plans 는 최신 버전부터 */
export const planDayFor = (plans: Plan[], date: string): PlanDay | undefined => {
  const plan = plans.find((p) => p.effective_from <= date);
  const day = plan?.days.find((d) => d.weekday === isoWeekday(date));
  return day && day.kind !== 'rest' ? day : undefined;
};
