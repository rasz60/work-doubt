import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { describePlan, describeSession } from '@/components/ActivityGrid';
import { Button, Field, Message, MiniInput, SectionTitle, Segmented, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import type { SessionPayload } from '@/api/endpoints';
import {
  addDays,
  formatDuration,
  formatLongDate,
  formatPace,
  isDateString,
  parseDuration,
  toNumber,
  todayString,
} from '@/lib/date';
import { space, useTheme } from '@/theme';
import { KIND_LABELS, SOURCE_LABELS, type Plan, type Session, type WorkoutKind } from '@/types';

import { planDayFor } from './plan';

const KINDS: { value: WorkoutKind; label: string }[] = [
  { value: 'run', label: '러닝' },
  { value: 'weight', label: '웨이트' },
  { value: 'other', label: '기타' },
];

interface SetDraft {
  exercise: string;
  weight: string;
  reps: string;
}

interface Draft {
  date: string;
  kind: WorkoutKind;
  title: string;
  distance: string;
  duration: string;
  kcal: string;
  heartRate: string;
  memo: string;
  sets: SetDraft[];
}

const emptySet = (): SetDraft => ({ exercise: '', weight: '', reps: '' });

const emptyDraft = (date: string, kind: WorkoutKind): Draft => ({
  date,
  kind,
  title: '',
  distance: '',
  duration: '',
  kcal: '',
  heartRate: '',
  memo: '',
  sets: kind === 'weight' ? [emptySet()] : [],
});

const str = (n?: number): string => (n === undefined ? '' : String(n));

const toDraft = (s: Session): Draft => ({
  date: s.performed_on,
  kind: s.kind,
  title: s.title,
  distance: str(s.distance_km),
  duration: s.duration_sec ? formatDuration(s.duration_sec) : '',
  kcal: str(s.calories_kcal),
  heartRate: str(s.avg_heart_rate),
  memo: s.memo ?? '',
  sets: s.sets.length ? s.sets.map((set) => ({ exercise: set.exercise, weight: str(set.weight_kg), reps: str(set.reps) })) : s.kind === 'weight' ? [emptySet()] : [],
});

const toPayload = (d: Draft): SessionPayload => {
  if (!isDateString(d.date)) throw new Error('날짜는 2026-10-21 처럼 입력하세요.');
  const duration = parseDuration(d.duration);
  if (d.duration.trim() && duration === undefined) throw new Error('시간은 28:30 (분:초), 1:02:03 또는 분 단위 숫자로 입력하세요.');
  const num = (value: string, label: string): number | undefined => {
    const n = toNumber(value);
    if (value.trim() && n === undefined) throw new Error(`${label}은(는) 숫자로 입력하세요.`);
    return n;
  };
  const kcal = num(d.kcal, '칼로리');
  const hr = num(d.heartRate, '심박수');

  const sets =
    d.kind === 'weight'
      ? d.sets
          .filter((s) => s.exercise.trim() || s.reps.trim() || s.weight.trim())
          .map((s) => {
            const exercise = s.exercise.trim();
            const reps = Math.round(toNumber(s.reps) ?? 0);
            if (!exercise) throw new Error('종목 이름이 빠진 세트가 있습니다.');
            if (reps <= 0) throw new Error(`${exercise}의 횟수를 입력하세요.`);
            return { exercise, reps, weight_kg: num(s.weight, `${exercise} 중량`) };
          })
      : undefined;

  return {
    performed_on: d.date,
    kind: d.kind,
    title: d.title.trim() || undefined,
    distance_km: d.kind === 'weight' ? undefined : num(d.distance, '거리'),
    duration_sec: duration,
    calories_kcal: kcal === undefined ? undefined : Math.round(kcal),
    avg_heart_rate: hr === undefined ? undefined : Math.round(hr),
    memo: d.memo.trim() || undefined,
    sets,
  };
};

interface SessionFormProps {
  plans: Plan[];
  /** HOME 에서 날짜를 골라 들어오면 그 날짜로 시작한다 */
  initialDate?: string;
  /** 고치기를 누르면 폼이 있는 맨 위로 올린다 */
  onEditStart: () => void;
}

// 일자별 수행 기록: 러닝은 거리 · 시간, 웨이트는 종목 · 중량 · 횟수(세트마다 한 줄).
export const SessionForm = ({ plans, initialDate, onEditStart }: SessionFormProps) => {
  const theme = useTheme();
  const today = todayString();

  const [draft, setDraft] = useState<Draft>(() => emptyDraft(initialDate ?? today, 'run'));
  const [editingId, setEditingId] = useState<string>('');
  const [recent, setRecent] = useState<Session[]>([]);
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<string>('');

  const loadRecent = useCallback(async (): Promise<void> => {
    try {
      setRecent((await api.fetchSessions(addDays(today, -13), today)).items.reverse());
    } catch (err) {
      setError(err instanceof Error ? err.message : '기록을 불러오지 못했습니다.');
    }
  }, [today]);

  // 다른 탭에서 돌아올 때(연동으로 새 기록이 들어왔을 수 있다) 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      void loadRecent();
    }, [loadRecent]),
  );

  // HOME 에서 다른 날짜를 골라 다시 들어온 경우: 그 날짜 · 계획 종류로 새 기록을 시작한다
  // 계획 목록이 늦게 도착하면 그때 한 번 더 맞춘다 (같은 날짜 · 계획 상태로는 한 번만 — 쓰던 입력을 덮지 않게)
  const applied = useRef<string>('');
  useEffect(() => {
    if (!initialDate) return;
    const key = `${initialDate}|${plans.length > 0}`;
    if (applied.current === key) return;
    applied.current = key;
    const planned = planDayFor(plans, initialDate);
    setEditingId('');
    setDraft(emptyDraft(initialDate, planned?.kind === 'weight' ? 'weight' : 'run'));
  }, [initialDate, plans]);

  const set = (patch: Partial<Draft>): void => setDraft((prev) => ({ ...prev, ...patch }));
  const setRow = (index: number, patch: Partial<SetDraft>): void =>
    setDraft((prev) => ({ ...prev, sets: prev.sets.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));

  const planned = isDateString(draft.date) ? planDayFor(plans, draft.date) : undefined;

  // 계획한 루틴을 세트 줄로 펼친다 (스쿼트 5×5 → 다섯 줄)
  const fillFromPlan = (): void => {
    if (!planned) return;
    if (planned.kind === 'run') {
      set({ kind: 'run', distance: str(planned.distance_km) });
      return;
    }
    const rows = (planned.exercises ?? []).flatMap((e) =>
      Array.from({ length: e.sets }, () => ({ exercise: e.name, weight: str(e.weight_kg), reps: str(e.reps) })),
    );
    set({ kind: 'weight', sets: rows.length ? rows : [emptySet()] });
  };

  const save = async (): Promise<void> => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const payload = toPayload(draft);
      const saved = editingId ? await api.updateSession(editingId, payload) : await api.createSession(payload);
      setNotice(`${formatLongDate(saved.performed_on)} ${KIND_LABELS[saved.kind]} 기록을 ${editingId ? '고쳤' : '저장했'}습니다.`);
      setEditingId('');
      setDraft(emptyDraft(draft.date, draft.kind));
      await loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (s: Session): Promise<void> => {
    if (confirmDelete !== s.id) {
      setConfirmDelete(s.id);
      return;
    }
    setConfirmDelete('');
    try {
      await api.deleteSession(s.id);
      if (editingId === s.id) {
        setEditingId('');
        setDraft(emptyDraft(draft.date, draft.kind));
      }
      await loadRecent();
    } catch (err) {
      setError(err instanceof Error ? err.message : '지우지 못했습니다.');
    }
  };

  const duration = parseDuration(draft.duration);
  const distance = toNumber(draft.distance);
  const livePace = draft.kind === 'run' && duration && distance ? formatPace(duration / distance) : '';

  return (
    <View style={{ gap: space(5) }}>
      <View style={{ gap: space(4) }}>
        <Field label="운동한 날 (YYYY-MM-DD)" value={draft.date} onChangeText={(v) => set({ date: v })} />
        {planned ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
            <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1 }}>이날 계획 · {describePlan(planned)}</Text>
            <TextButton title="계획대로 채우기" onPress={fillFromPlan} />
          </View>
        ) : null}
        <Segmented
          options={KINDS}
          value={draft.kind}
          onChange={(kind) => set({ kind, sets: kind === 'weight' && draft.sets.length === 0 ? [emptySet()] : draft.sets })}
        />

        {draft.kind === 'other' ? <Field label="운동 이름" value={draft.title} onChangeText={(v) => set({ title: v })} placeholder="수영, 자전거 …" /> : null}

        {draft.kind !== 'weight' ? (
          <View style={{ flexDirection: 'row', gap: space(4) }}>
            <View style={{ flex: 1 }}>
              <Field label="거리 (km)" value={draft.distance} onChangeText={(v) => set({ distance: v })} keyboardType="decimal-pad" />
            </View>
            <View style={{ flex: 1 }}>
              <Field label="시간 (분:초)" value={draft.duration} onChangeText={(v) => set({ duration: v })} placeholder="28:30" />
            </View>
          </View>
        ) : null}
        {livePace ? <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>페이스 {livePace} /km</Text> : null}

        {draft.kind === 'weight' ? (
          <View style={{ gap: space(2) }}>
            {draft.sets.map((row, index) => (
              <View key={index} style={{ flexDirection: 'row', gap: space(2), alignItems: 'flex-end' }}>
                <Text style={{ color: theme.textMuted, fontSize: 11, width: 18, paddingBottom: space(2) }}>{index + 1}</Text>
                <MiniInput label={index === 0 ? '종목' : undefined} value={row.exercise} onChangeText={(v) => setRow(index, { exercise: v })} placeholder="스쿼트" flex={3} />
                <MiniInput label={index === 0 ? '중량 kg' : undefined} value={row.weight} onChangeText={(v) => setRow(index, { weight: v })} keyboardType="decimal-pad" placeholder="맨몸" flex={1.4} />
                <MiniInput label={index === 0 ? '횟수' : undefined} value={row.reps} onChangeText={(v) => setRow(index, { reps: v })} keyboardType="number-pad" flex={1} />
                <Pressable onPress={() => set({ sets: draft.sets.filter((_, i) => i !== index) })} hitSlop={8} accessibilityLabel="세트 지우기">
                  <Text style={{ color: theme.textMuted, fontSize: 16, paddingBottom: space(1.5) }}>×</Text>
                </Pressable>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: space(4) }}>
              <TextButton
                title="+ 같은 세트"
                onPress={() => {
                  const last = draft.sets[draft.sets.length - 1];
                  set({ sets: [...draft.sets, last ? { ...last } : emptySet()] });
                }}
              />
              <TextButton title="+ 새 종목" onPress={() => set({ sets: [...draft.sets, emptySet()] })} />
            </View>
            <Field label="운동 시간 (분:초 또는 분, 선택)" value={draft.duration} onChangeText={(v) => set({ duration: v })} placeholder="50" />
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: space(4) }}>
          <View style={{ flex: 1 }}>
            <Field label="소비 칼로리 (선택)" value={draft.kcal} onChangeText={(v) => set({ kcal: v })} keyboardType="decimal-pad" placeholder="비우면 추정" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="평균 심박 (선택)" value={draft.heartRate} onChangeText={(v) => set({ heartRate: v })} keyboardType="decimal-pad" />
          </View>
        </View>
        <Field label="메모" value={draft.memo} onChangeText={(v) => set({ memo: v })} multiline autoCapitalize="sentences" />

        <Message text={error} tone="error" />
        <Message text={notice} />
        <Button title={busy ? 'SAVING…' : editingId ? 'UPDATE' : 'SAVE'} onPress={() => void save()} disabled={busy} />
        {editingId ? (
          <Button
            title="CANCEL"
            variant="ghost"
            onPress={() => {
              setEditingId('');
              setDraft(emptyDraft(draft.date, draft.kind));
            }}
          />
        ) : null}
      </View>

      <SectionTitle title="Recent 2 Weeks" caption="연동한 기기 · 앱에서 들어온 기록도 여기서 고칠 수 있습니다 (메모 · 세트 추가 등)." />
      {recent.length === 0 ? <Message text="최근 2주 기록이 없습니다." /> : null}
      {recent.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space(3), paddingBottom: space(3), borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>
              {formatLongDate(s.performed_on)} · {KIND_LABELS[s.kind]} · {SOURCE_LABELS[s.source]}
            </Text>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: '700' }} numberOfLines={1}>
              {describeSession(s)}
            </Text>
            {s.memo ? (
              <Text style={{ color: theme.textMuted, fontSize: 12 }} numberOfLines={1}>
                {s.memo}
              </Text>
            ) : null}
          </View>
          <TextButton
            title="고치기"
            onPress={() => {
              setEditingId(s.id);
              setDraft(toDraft(s));
              setNotice('');
              onEditStart();
            }}
          />
          <TextButton title={confirmDelete === s.id ? '정말 지우기' : '지우기'} tone="danger" onPress={() => void remove(s)} />
        </View>
      ))}
    </View>
  );
};
