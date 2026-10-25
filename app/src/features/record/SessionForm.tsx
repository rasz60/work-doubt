import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { describePlan, describeSession } from '@/components/ActivityGrid';
import { Button, Card, DateStepper, Field, KindDot, KindPicker, Message, SectionTitle, T, TextButton } from '@/components/ui';
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
import { radius, space, useTheme } from '@/theme';
import { KIND_LABELS, SOURCE_LABELS, type Plan, type Session, type WorkoutKind } from '@/types';

import { ExerciseBlocks } from './ExerciseBlocks';
import { blocksForSession, blocksFromSets, emptyBlock, setsFromBlocks, type ExerciseBlock } from './exercises';
import { planDayFor } from './plan';

const KINDS: { value: WorkoutKind; label: string }[] = [
  { value: 'run', label: '러닝' },
  { value: 'weight', label: '웨이트' },
  { value: 'other', label: '기타' },
];

interface Draft {
  date: string;
  kind: WorkoutKind;
  title: string;
  distance: string;
  duration: string;
  kcal: string;
  heartRate: string;
  memo: string;
  blocks: ExerciseBlock[];
}

const emptyDraft = (date: string, kind: WorkoutKind): Draft => ({
  date,
  kind,
  title: '',
  distance: '',
  duration: '',
  kcal: '',
  heartRate: '',
  memo: '',
  blocks: kind === 'weight' ? [emptyBlock()] : [],
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
  blocks: s.sets.length ? blocksFromSets(s.sets) : s.kind === 'weight' ? [emptyBlock()] : [],
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

  const sets = d.kind === 'weight' ? setsFromBlocks(d.blocks) : undefined;

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
  /** 홈에서 날짜를 골라 들어오면 그 날짜로 시작한다 */
  initialDate?: string;
  /** 고치기를 누르면 폼이 있는 맨 위로 올린다 */
  onEditStart: () => void;
}

// 일자별 수행 기록: 러닝은 거리 · 시간, 웨이트는 종목마다 무게 × 횟수 × 세트 줄.
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
  // 칼로리 · 심박 · 메모는 자주 안 쓰므로 접어 둔다 (값이 있으면 펼친다)
  const [more, setMore] = useState<boolean>(false);

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

  // 홈에서 다른 날짜를 골라 다시 들어온 경우: 그 날짜 · 계획 종류로 새 기록을 시작한다
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

  const planned = isDateString(draft.date) ? planDayFor(plans, draft.date) : undefined;

  // 계획한 루틴을 그대로 채운다 (무게 · 횟수 · 세트)
  const fillFromPlan = (): void => {
    if (!planned) return;
    if (planned.kind === 'run') {
      set({ kind: 'run', distance: str(planned.distance_km) });
      return;
    }
    const blocks = blocksForSession(planned.exercises ?? []);
    set({ kind: 'weight', blocks: blocks.length ? blocks : [emptyBlock()] });
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
  const showMore = more || !!(draft.kcal || draft.heartRate || draft.memo);
  const kindColor = draft.kind === 'run' ? theme.run : draft.kind === 'weight' ? theme.weight : theme.other;

  return (
    <View style={{ gap: space(4) }}>
      <Card kind={draft.kind} style={{ gap: space(5) }}>
        {editingId ? (
          <T variant="label" color={kindColor.ink}>
            기록 고치는 중
          </T>
        ) : null}
        <DateStepper value={draft.date} onChange={(date) => set({ date })} max={today} />

        <KindPicker
          options={KINDS}
          value={draft.kind}
          onChange={(kind) => set({ kind, blocks: kind === 'weight' && draft.blocks.length === 0 ? [emptyBlock()] : draft.blocks })}
        />

        {planned ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space(3),
              backgroundColor: theme.field,
              borderRadius: radius.box,
              paddingHorizontal: space(3),
              paddingVertical: space(2),
            }}
          >
            <KindDot kind={planned.kind} />
            <T variant="caption" color={theme.text} style={{ flex: 1 }}>
              계획 · {describePlan(planned)}
            </T>
            {planned.kind !== 'rest' ? <TextButton title="계획대로 채우기" onPress={fillFromPlan} /> : null}
          </View>
        ) : null}

        {draft.kind === 'other' ? <Field label="운동 이름" value={draft.title} onChangeText={(v) => set({ title: v })} placeholder="수영, 자전거 …" /> : null}

        {draft.kind !== 'weight' ? (
          <View style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', gap: space(3) }}>
              <Field
                label="거리"
                unit="km"
                value={draft.distance}
                onChangeText={(v) => set({ distance: v })}
                keyboardType="decimal-pad"
                placeholder="5.0"
                style={{ flex: 1 }}
              />
              <Field label="시간" value={draft.duration} onChangeText={(v) => set({ duration: v })} digits placeholder="28:30" hint="분:초 · 1:02:03" style={{ flex: 1 }} />
            </View>
            {livePace ? (
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2) }}>
                <T variant="label">페이스</T>
                <T variant="numLg" color={kindColor.ink}>
                  {livePace}
                </T>
                <T variant="label">/km</T>
              </View>
            ) : null}
          </View>
        ) : null}

        {draft.kind === 'weight' ? (
          <View style={{ gap: space(4) }}>
            <ExerciseBlocks blocks={draft.blocks} onChange={(blocks) => set({ blocks })} />
            <Field label="운동 시간 (선택)" unit="분" value={draft.duration} onChangeText={(v) => set({ duration: v })} digits placeholder="50" style={{ width: 160 }} />
          </View>
        ) : null}

        {showMore ? (
          <View style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', gap: space(3) }}>
              <Field
                label="소비 칼로리"
                unit="kcal"
                value={draft.kcal}
                onChangeText={(v) => set({ kcal: v })}
                keyboardType="decimal-pad"
                placeholder="자동"
                style={{ flex: 1 }}
              />
              <Field label="평균 심박" unit="bpm" value={draft.heartRate} onChangeText={(v) => set({ heartRate: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
            <Field label="메모" value={draft.memo} onChangeText={(v) => set({ memo: v })} multiline autoCapitalize="sentences" placeholder="컨디션, 느낀 점 …" />
          </View>
        ) : (
          <TextButton title="+ 칼로리 · 심박 · 메모" tone="muted" onPress={() => setMore(true)} />
        )}

        <Message text={error} tone="error" />
        <Message text={notice} tone="ok" />
        <View style={{ gap: space(2) }}>
          <Button title={busy ? '저장하는 중…' : editingId ? '고친 내용 저장' : '저장'} kind={draft.kind} onPress={() => void save()} disabled={busy} />
          {editingId ? (
            <Button
              title="고치기 취소"
              variant="secondary"
              onPress={() => {
                setEditingId('');
                setDraft(emptyDraft(draft.date, draft.kind));
              }}
            />
          ) : null}
        </View>
      </Card>

      <SectionTitle title="최근 2주" caption="연동한 기기 · 앱에서 들어온 기록도 고칠 수 있어요." />
      {recent.length === 0 ? <Message text="최근 2주 기록이 없어요." /> : null}
      {recent.length > 0 ? (
        <Card style={{ paddingVertical: space(1), gap: 0 }}>
          {recent.map((s, i) => (
            <View
              key={s.id}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space(3),
                paddingVertical: space(3),
                borderTopWidth: i === 0 ? 0 : 1,
                borderTopColor: theme.line,
                opacity: editingId === s.id ? 0.5 : 1,
              }}
            >
              <KindDot kind={s.kind} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <T variant="small" style={{ fontWeight: '500' }}>
                  {formatLongDate(s.performed_on)} · {KIND_LABELS[s.kind]}
                  {s.source !== 'manual' ? ` · ${SOURCE_LABELS[s.source]}` : ''}
                </T>
                <T variant="bodyStrong" numberOfLines={1}>
                  {describeSession(s)}
                </T>
                {s.memo ? (
                  <T variant="caption" numberOfLines={1}>
                    {s.memo}
                  </T>
                ) : null}
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <TextButton
                  title="고치기"
                  onPress={() => {
                    setEditingId(s.id);
                    setDraft(toDraft(s));
                    setNotice('');
                    onEditStart();
                  }}
                />
                <TextButton
                  title={confirmDelete === s.id ? '정말 지울까요?' : '지우기'}
                  tone={confirmDelete === s.id ? 'danger' : 'muted'}
                  onPress={() => void remove(s)}
                />
              </View>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
};
