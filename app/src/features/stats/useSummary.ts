import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import * as api from '@/api/endpoints';
import { monthOf, todayString } from '@/lib/date';
import type { ActivitySummary, ExerciseStat } from '@/types';

/** 이번 달 요약(칼로리 · 러닝 · 웨이트). 화면에 돌아올 때마다 다시 불러온다 */
export const useSummary = () => {
  const month = monthOf(todayString());
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [error, setError] = useState<string>('');

  const reload = useCallback(async (): Promise<void> => {
    try {
      setSummary(await api.fetchActivitySummary(month));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.');
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { summary, error, reload };
};

/** +1.0 / −1.0 / ±0.0 */
export const signed = (n: number, digits = 1): string => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

/** 맨몸 종목(무게 없이 횟수만)은 1RM 대신 최대 횟수로 본다 */
export const isBodyweight = (e: ExerciseStat): boolean => e.top_weight_kg <= 0;
