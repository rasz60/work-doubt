import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import * as api from '@/api/endpoints';
import type { CalendarDay } from '@/types';

interface CalendarState {
  days: CalendarDay[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
}

/** [from, to] 의 잔디. 화면에 돌아올 때마다 다시 읽는다 (다른 탭에서 기록 · 계획을 바꿨을 수 있다) */
export const useCalendar = (from: string, to: string): CalendarState => {
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const reload = useCallback(async (): Promise<void> => {
    try {
      setDays((await api.fetchCalendar(from, to)).items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '운동 기록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { days, loading, error, reload };
};
