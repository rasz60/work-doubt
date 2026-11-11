import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { describePlan } from '@/components/ActivityGrid';
import { KindMark } from '@/components/KindMark';
import { Button, DatePicker, Header, Loading, Message, Page, Screen, StickyFooter, T, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { exerciseNames } from '@/features/record/exercises';
import { planDayFor } from '@/features/record/plan';
import { SessionEditor, draftFor, draftFromSession, payloadFromDraft, type SessionDraft } from '@/features/record/SessionEditor';
import { addDays, isDateString, todayString } from '@/lib/date';
import { space, useTheme } from '@/theme';
import { SOURCE_LABELS, type Plan, type Session } from '@/types';

/** 저장하고 돌아갈 곳 (주소로 바로 열어 돌아갈 곳이 없으면 오늘) */
const leave = (): void => (router.canGoBack() ? router.back() : router.replace('/'));

// 기록 입력 · 고치기: /log?date=YYYY-MM-DD (새 기록) · /log?id=<기록>&date=YYYY-MM-DD (고치기)
const Log = () => {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const today = todayString();
  const startDate = typeof params.date === 'string' && isDateString(params.date) && params.date <= today ? params.date : today;
  const editingId = typeof params.id === 'string' ? params.id : '';

  const [plans, setPlans] = useState<Plan[]>([]);
  const [recent, setRecent] = useState<Session[]>([]);
  const [original, setOriginal] = useState<Session | null>(null);
  const [draft, setDraft] = useState<SessionDraft>(() => draftFor(startDate));
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
  // 손대기 전이면 날짜를 바꿀 때 그날 계획으로 다시 채운다
  const touched = useRef<boolean>(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [planList, sessions] = await Promise.all([api.fetchPlans(), api.fetchSessions(addDays(today, -60), today)]);
        if (!alive) return;
        setPlans(planList.items);
        setRecent([...sessions.items].reverse());
        if (editingId) {
          const found =
            sessions.items.find((s) => s.id === editingId) ??
            (await api.fetchSessions(startDate, startDate)).items.find((s) => s.id === editingId);
          if (!alive) return;
          if (!found) {
            setError('고칠 기록을 찾지 못했어요. 이미 지웠을 수 있어요.');
          } else {
            setOriginal(found);
            setDraft(draftFromSession(found));
          }
        } else {
          setDraft(draftFor(startDate, planDayFor(planList.items, startDate)));
        }
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : '불러오지 못했습니다.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [editingId, startDate, today]);

  const set = (patch: Partial<SessionDraft>): void => {
    touched.current = true;
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const changeDate = (date: string): void => {
    if (!editingId && !touched.current) {
      setDraft(draftFor(date, planDayFor(plans, date)));
      return;
    }
    setDraft((prev) => ({ ...prev, date }));
  };

  const save = async (): Promise<void> => {
    setError('');
    setBusy(true);
    try {
      const payload = payloadFromDraft(draft);
      if (editingId) await api.updateSession(editingId, payload);
      else await api.createSession(payload);
      leave();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했습니다.');
      setBusy(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    try {
      await api.deleteSession(editingId);
      leave();
    } catch (err) {
      setError(err instanceof Error ? err.message : '지우지 못했습니다.');
      setBusy(false);
    }
  };

  const planned = isDateString(draft.date) ? planDayFor(plans, draft.date) : undefined;
  const suggestions = exerciseNames(plans, recent);

  return (
    <Screen>
      <Page footerSpace>
        <Header back="닫기" title={editingId ? '기록 고치기' : '기록하기'} />
        <View style={{ gap: space(2) }}>
          <DatePicker value={draft.date} onChange={changeDate} max={today} />
          {planned ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <KindMark kind={planned.kind} size={8} color={theme.muted} />
              <T variant="caption" style={{ flex: 1 }}>
                이날 계획 · {describePlan(planned)}
              </T>
            </View>
          ) : null}
          {original && original.source !== 'manual' ? <T variant="caption">{SOURCE_LABELS[original.source]}에서 들어온 기록이에요.</T> : null}
        </View>

        {loading ? (
          <Loading />
        ) : (
          <SessionEditor draft={draft} onChange={set} suggestions={suggestions} />
        )}

        <Message text={error} tone="error" />

        {editingId && original ? (
          <TextButton
            title={confirmDelete ? '정말 지울까요? 한 번 더 누르면 지워요' : '이 기록 지우기'}
            tone={confirmDelete ? 'danger' : 'muted'}
            onPress={() => void remove()}
            disabled={busy}
          />
        ) : null}
      </Page>
      <StickyFooter>
        <Button title={busy ? '저장하는 중…' : editingId ? '고친 내용 저장' : '저장'} onPress={() => void save()} disabled={busy || loading || (!!editingId && !original)} />
      </StickyFooter>
    </Screen>
  );
};

export default Log;
