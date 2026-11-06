import React, { useState } from 'react';
import { View } from 'react-native';

import { Field, KindChips, NumberInput, T, TextButton } from '@/components/ui';
import type { SessionPayload } from '@/api/endpoints';
import { formatDuration, formatPace, isDateString, parseDuration, toNumber } from '@/lib/date';
import { space } from '@/theme';
import type { PlanDay, Session, WorkoutKind } from '@/types';

import { ExerciseBlocks } from './ExerciseBlocks';
import { blocksForSession, blocksFromSets, setsFromBlocks, type ExerciseBlock } from './exercises';

export const KINDS: { value: WorkoutKind; label: string }[] = [
  { value: 'run', label: '러닝' },
  { value: 'weight', label: '웨이트' },
  { value: 'other', label: '기타' },
];

/** 기록 입력 상태 (입력 칸은 문자열) */
export interface SessionDraft {
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

const str = (n?: number): string => (n === undefined || n === null ? '' : String(n));

/** 새 기록: 그날 계획이 있으면 처음부터 계획 내용으로 채운다 (러닝은 거리, 웨이트는 종목 · 세트) */
export const draftFor = (date: string, planned?: PlanDay, kind?: WorkoutKind): SessionDraft => {
  const k: WorkoutKind = kind ?? (planned?.kind === 'weight' ? 'weight' : planned?.kind === 'run' ? 'run' : 'run');
  const fromPlan = planned && planned.kind === k;
  return {
    date,
    kind: k,
    title: '',
    distance: fromPlan && k === 'run' ? str(planned.distance_km) : '',
    duration: '',
    kcal: '',
    heartRate: '',
    memo: '',
    blocks: fromPlan && k === 'weight' ? blocksForSession(planned.exercises ?? []) : [],
  };
};

export const draftFromSession = (s: Session): SessionDraft => ({
  date: s.performed_on,
  kind: s.kind,
  title: s.title,
  distance: str(s.distance_km),
  duration: s.duration_sec ? formatDuration(s.duration_sec) : '',
  kcal: str(s.calories_kcal),
  heartRate: str(s.avg_heart_rate),
  memo: s.memo ?? '',
  blocks: s.sets.length ? blocksFromSets(s.sets) : [],
});

/** 입력을 서버 형식으로. 형식이 틀린 칸이 있으면 화면에 보여 줄 문장을 던진다 */
export const payloadFromDraft = (d: SessionDraft): SessionPayload => {
  if (!isDateString(d.date)) throw new Error('날짜가 올바르지 않아요.');
  const duration = parseDuration(d.duration);
  if (d.duration.trim() && duration === undefined) throw new Error('시간은 28:30 (분:초), 1:02:03 또는 분 단위 숫자로 입력하세요.');
  const num = (value: string, label: string): number | undefined => {
    const n = toNumber(value);
    if (value.trim() && n === undefined) throw new Error(`${label}은(는) 숫자로 입력하세요.`);
    return n;
  };
  const kcal = num(d.kcal, '칼로리');
  const hr = num(d.heartRate, '심박수');

  return {
    performed_on: d.date,
    kind: d.kind,
    title: d.title.trim() || undefined,
    distance_km: d.kind === 'weight' ? undefined : num(d.distance, '거리'),
    duration_sec: duration,
    calories_kcal: kcal === undefined ? undefined : Math.round(kcal),
    avg_heart_rate: hr === undefined ? undefined : Math.round(hr),
    memo: d.memo.trim() || undefined,
    sets: d.kind === 'weight' ? setsFromBlocks(d.blocks) : undefined,
  };
};

interface SessionEditorProps {
  draft: SessionDraft;
  onChange: (patch: Partial<SessionDraft>) => void;
  /** 고를 수 있는 종목 이름 */
  suggestions: string[];
}

/**
 * 기록 입력 본문. 처음 보이는 입력은 러닝 2개(거리 · 시간), 웨이트는 줄 글자 + 종목 칩뿐이다.
 * 칼로리 · 심박 · 메모는 접어 두고, 값이 있으면 펼친다.
 */
export const SessionEditor = ({ draft, onChange, suggestions }: SessionEditorProps) => {
  const [more, setMore] = useState<boolean>(false);
  const showMore = more || !!(draft.kcal || draft.heartRate || draft.memo);

  const duration = parseDuration(draft.duration);
  const distance = toNumber(draft.distance);
  const pace = draft.kind === 'run' && duration && distance ? formatPace(duration / distance) : '';
  const durationInvalid = draft.duration.trim() !== '' && duration === undefined;

  return (
    <View style={{ gap: space(7) }}>
      <KindChips
        options={KINDS}
        value={draft.kind}
        onChange={(kind) => onChange({ kind })}
      />

      {draft.kind === 'other' ? (
        <Field label="운동 이름" value={draft.title} onChangeText={(v) => onChange({ title: v })} placeholder="수영, 자전거 … (비우면 '운동')" />
      ) : null}

      {draft.kind !== 'weight' ? (
        <View style={{ gap: space(3) }}>
          <View style={{ flexDirection: 'row', gap: space(5) }}>
            <NumberInput label="거리" unit="km" value={draft.distance} onChangeText={(v) => onChange({ distance: v })} placeholder="0.0" style={{ flex: 1 }} />
            <NumberInput
              label="시간"
              value={draft.duration}
              onChangeText={(v) => onChange({ duration: v })}
              placeholder="00:00"
              decimal={false}
              invalid={durationInvalid}
              hint={durationInvalid ? '28:30 처럼 분:초로' : '분:초'}
              style={{ flex: 1 }}
            />
          </View>
          {pace ? (
            <T variant="label">
              페이스 <T variant="numMd">{pace}</T> /km
            </T>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: space(6) }}>
          <ExerciseBlocks blocks={draft.blocks} onChange={(blocks) => onChange({ blocks })} suggestions={suggestions} />
          <NumberInput label="운동 시간 (선택)" unit="분" value={draft.duration} onChangeText={(v) => onChange({ duration: v })} placeholder="0" size="medium" style={{ width: 160 }} />
        </View>
      )}

      {showMore ? (
        <View style={{ gap: space(5) }}>
          <View style={{ flexDirection: 'row', gap: space(5) }}>
            <NumberInput label="소비 칼로리" unit="kcal" value={draft.kcal} onChangeText={(v) => onChange({ kcal: v })} placeholder="자동" size="medium" style={{ flex: 1 }} />
            <NumberInput label="평균 심박" unit="bpm" value={draft.heartRate} onChangeText={(v) => onChange({ heartRate: v })} placeholder="-" size="medium" style={{ flex: 1 }} />
          </View>
          <Field label="메모" value={draft.memo} onChangeText={(v) => onChange({ memo: v })} multiline autoCapitalize="sentences" placeholder="컨디션, 느낀 점 …" />
        </View>
      ) : (
        <TextButton title="+ 칼로리 · 심박 · 메모" tone="muted" onPress={() => setMore(true)} />
      )}
    </View>
  );
};
