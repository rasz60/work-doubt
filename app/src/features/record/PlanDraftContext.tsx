import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import * as api from '@/api/endpoints';
import { todayString } from '@/lib/date';
import type { Plan } from '@/types';

import { toDraft, type DayDraft, type PlanDraft } from './plan';

interface PlanDraftState {
  /** 저장된 계획 버전 (최신부터) */
  plans: Plan[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  /** 편집 중인 계획. 요일 화면에서 고친 내용은 "계획 저장"을 눌러야 서버로 간다 */
  draft: PlanDraft;
  setDraft: (next: PlanDraft | ((prev: PlanDraft) => PlanDraft)) => void;
  updateDay: (weekday: number, patch: Partial<DayDraft>) => void;
  /** 저장하지 않은 변경이 있는지 */
  dirty: boolean;
  setDirty: (dirty: boolean) => void;
}

const Ctx = createContext<PlanDraftState | null>(null);

/** 계획 화면들(/plan, /plan/[weekday], /plan/history)이 같은 초안을 본다 */
export const PlanDraftProvider = ({ children }: { children: React.ReactNode }) => {
  const today = todayString();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [draft, setDraftState] = useState<PlanDraft>(() => toDraft(today));
  const [dirty, setDirty] = useState<boolean>(false);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setPlans((await api.fetchPlans()).items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '계획을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // 처음 받아 오면 지금 적용 중인 계획으로 편집을 시작한다 (이미 고치고 있으면 덮지 않는다)
  const current = plans.find((p) => p.effective_from <= today);
  const currentId = current?.id;
  useEffect(() => {
    if (!dirty && current) setDraftState(toDraft(today, current));
  }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDraft = useCallback((next: PlanDraft | ((prev: PlanDraft) => PlanDraft)) => {
    setDirty(true);
    setDraftState(next);
  }, []);

  const updateDay = useCallback(
    (weekday: number, patch: Partial<DayDraft>) =>
      setDraft((prev) => ({ ...prev, days: prev.days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)) })),
    [setDraft],
  );

  const value = useMemo(
    () => ({ plans, loading, error, reload, draft, setDraft, updateDay, dirty, setDirty }),
    [plans, loading, error, reload, draft, setDraft, updateDay, dirty],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const usePlanDraft = (): PlanDraftState => {
  const v = useContext(Ctx);
  if (!v) throw new Error('usePlanDraft 는 PlanDraftProvider 안에서만 쓴다');
  return v;
};
