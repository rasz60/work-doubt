import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { describePlan } from '@/components/ActivityGrid';
import { Button, Chip, Field, Message, MiniInput, SectionTitle, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { addDays, formatShortDate, todayString, weekdayLabel } from '@/lib/date';
import { space, tracking, useTheme } from '@/theme';
import { KIND_LABELS, type Plan, type PlanKind } from '@/types';

import { ExerciseBlocks } from './ExerciseBlocks';
import { emptyBlock } from './exercises';
import { examplePlan, fromDraft, toDraft, type DayDraft, type PlanDraft } from './plan';

const PLAN_KINDS: PlanKind[] = ['rest', 'run', 'weight'];

interface PlanEditorProps {
  plans: Plan[]; // 최신 버전부터
  onSaved: () => Promise<void>;
}

// 요일별 주간 루틴. 저장할 때마다 "적용 시작일"이 붙은 새 버전이 쌓인다 (지난 잔디는 그때 계획으로 채점).
export const PlanEditor = ({ plans, onSaved }: PlanEditorProps) => {
  const theme = useTheme();
  const today = todayString();
  const current = plans.find((p) => p.effective_from <= today);

  const [draft, setDraft] = useState<PlanDraft>(() => toDraft(today, current));
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [confirmDelete, setConfirmDelete] = useState<string>('');

  // 계획 목록을 처음 받아 오면 지금 계획으로 편집을 시작한다
  const currentId = current?.id;
  useEffect(() => {
    setDraft((prev) => (prev.days.every((d) => d.kind === 'rest') && current ? toDraft(today, current) : prev));
  }, [currentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const updateDay = (weekday: number, patch: Partial<DayDraft>): void =>
    setDraft((prev) => ({ ...prev, days: prev.days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)) }));

  const save = async (): Promise<void> => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const saved = await api.savePlan(fromDraft(draft));
      await onSaved();
      setNotice(`${formatShortDate(saved.effective_from)}부터 적용되는 계획을 저장했습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '계획을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (plan: Plan): Promise<void> => {
    if (confirmDelete !== plan.id) {
      setConfirmDelete(plan.id);
      return;
    }
    setConfirmDelete('');
    try {
      await api.deletePlan(plan.id);
      await onSaved();
      setNotice(`${formatShortDate(plan.effective_from)} 버전을 지웠습니다.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '지우지 못했습니다.');
    }
  };

  return (
    <View style={{ gap: space(5) }}>
      <View style={{ gap: space(3) }}>
        <Message text="요일마다 러닝(목표 거리 · 페이스) 또는 웨이트(종목 · 세트 · 횟수 · 중량)를 정합니다. 저장하면 적용 시작일부터 새 계획이 쓰이고, 그 전 날짜의 잔디는 예전 계획으로 채점됩니다." />
        <View style={{ flexDirection: 'row', gap: space(4) }}>
          <View style={{ flex: 1 }}>
            <Field label="적용 시작일 (YYYY-MM-DD)" value={draft.effectiveFrom} onChangeText={(v) => setDraft((p) => ({ ...p, effectiveFrom: v }))} />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="계획 이름 (선택)" value={draft.title} onChangeText={(v) => setDraft((p) => ({ ...p, title: v }))} />
          </View>
        </View>
        <TextButton title="예시로 채우기 · 월수금 러닝 / 토일 웨이트" tone="muted" onPress={() => setDraft(examplePlan(draft.effectiveFrom))} />
      </View>

      {draft.days.map((day) => (
        <View key={day.weekday} style={{ gap: space(2), borderTopWidth: 1, borderTopColor: theme.border, paddingTop: space(3) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
            <Text style={{ color: theme.text, fontSize: 18, fontWeight: '800', width: 28 }}>{weekdayLabel(day.weekday)}</Text>
            {PLAN_KINDS.map((kind) => (
              <Chip
                key={kind}
                label={KIND_LABELS[kind]}
                selected={day.kind === kind}
                onPress={() =>
                  updateDay(day.weekday, {
                    kind,
                    blocks: kind === 'weight' && day.blocks.length === 0 ? [emptyBlock()] : day.blocks,
                  })
                }
              />
            ))}
          </View>

          {day.kind === 'run' ? (
            <View style={{ flexDirection: 'row', gap: space(3), paddingLeft: 36 }}>
              <MiniInput label="거리 (km)" value={day.distance} onChangeText={(v) => updateDay(day.weekday, { distance: v })} keyboardType="decimal-pad" flex={1} />
              <MiniInput label="페이스 (분:초)" value={day.pace} onChangeText={(v) => updateDay(day.weekday, { pace: v })} placeholder="5:30" flex={1} />
              <MiniInput label="목표 kcal" value={day.targetKcal} onChangeText={(v) => updateDay(day.weekday, { targetKcal: v })} keyboardType="number-pad" placeholder="자동" flex={1} />
            </View>
          ) : null}

          {day.kind === 'weight' ? (
            <View style={{ gap: space(3), paddingLeft: 36 }}>
              <ExerciseBlocks blocks={day.blocks} onChange={(blocks) => updateDay(day.weekday, { blocks })} />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                <MiniInput label="목표 kcal (선택)" value={day.targetKcal} onChangeText={(v) => updateDay(day.weekday, { targetKcal: v })} keyboardType="number-pad" placeholder="자동" width={96} />
              </View>
            </View>
          ) : null}
        </View>
      ))}

      <Message text={error} tone="error" />
      <Message text={notice} />
      <Button title={busy ? '저장하는 중…' : '계획 저장'} onPress={() => void save()} disabled={busy} />

      <SectionTitle title="Plan History" caption="계획을 고칠 때마다 버전이 남습니다. 불러오면 그 내용으로 편집을 시작합니다." />
      {plans.length === 0 ? <Message text="저장한 계획이 없습니다." /> : null}
      {plans.map((plan, index) => {
        const next = plans[index - 1]; // 목록이 최신부터라 바로 앞이 다음 버전
        const until = next ? formatShortDate(addDays(next.effective_from, -1)) : '';
        const isCurrent = plan.id === current?.id;
        const isFuture = plan.effective_from > today;
        const lines = plan.days.filter((d) => d.kind !== 'rest').map((d) => `${weekdayLabel(d.weekday)} ${describePlan(d)}`);
        return (
          <View key={plan.id} style={{ gap: space(1), paddingBottom: space(3), borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2) }}>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }}>
                {formatShortDate(plan.effective_from)} ~ {until}
              </Text>
              {isCurrent || isFuture ? (
                <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800', letterSpacing: tracking.label }}>
                  {isCurrent ? 'NOW' : 'NEXT'}
                </Text>
              ) : null}
              <Text style={{ color: theme.textMuted, fontSize: 12, flex: 1 }} numberOfLines={1}>
                {plan.title}
              </Text>
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>{lines.length ? lines.join('\n') : '모두 휴식'}</Text>
            <View style={{ flexDirection: 'row', gap: space(4) }}>
              <TextButton
                title="불러오기"
                onPress={() => {
                  setDraft(toDraft(plan.effective_from > today ? plan.effective_from : today, plan));
                  setNotice('불러온 계획을 고친 뒤 저장하면 적용 시작일부터 새 버전이 됩니다.');
                }}
              />
              <TextButton title={confirmDelete === plan.id ? '정말 지우기' : '지우기'} tone="danger" onPress={() => void remove(plan)} />
            </View>
          </View>
        );
      })}
    </View>
  );
};
