import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { describePlan } from '@/components/ActivityGrid';
import { Button, Card, DateStepper, Field, KindDot, KindPicker, Message, SectionTitle, T, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { addDays, formatShortDate, todayString, weekdayLabel } from '@/lib/date';
import { radius, space, useTheme } from '@/theme';
import { KIND_LABELS, type Plan, type PlanKind } from '@/types';

import { ExerciseBlocks } from './ExerciseBlocks';
import { emptyBlock } from './exercises';
import { examplePlan, fromDraft, toDraft, type DayDraft, type PlanDraft } from './plan';

const PLAN_KINDS: { value: PlanKind; label: string }[] = (['rest', 'run', 'weight'] as const).map((value) => ({ value, label: KIND_LABELS[value] }));

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
    <View style={{ gap: space(4) }}>
      <Card style={{ gap: space(4) }}>
        <T variant="label">적용 시작일</T>
        <DateStepper value={draft.effectiveFrom} onChange={(v) => setDraft((p) => ({ ...p, effectiveFrom: v }))} />
        <Field label="계획 이름 (선택)" value={draft.title} onChangeText={(v) => setDraft((p) => ({ ...p, title: v }))} placeholder="가을 10K 준비" />
        <T variant="caption">저장하면 시작일부터 새 계획이 쓰이고, 그 전 날의 잔디는 예전 계획으로 채점돼요.</T>
        <TextButton title="예시로 채우기 · 월수금 러닝, 토일 웨이트" tone="muted" onPress={() => setDraft(examplePlan(draft.effectiveFrom))} />
      </Card>

      {draft.days.map((day) => (
        <Card key={day.weekday} kind={day.kind} style={{ gap: space(3) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
            <T variant="title" style={{ width: 30, fontSize: 22 }}>
              {weekdayLabel(day.weekday)}
            </T>
            <View style={{ flex: 1 }}>
              <KindPicker
                size="small"
                options={PLAN_KINDS}
                value={day.kind}
                onChange={(kind) =>
                  updateDay(day.weekday, {
                    kind,
                    blocks: kind === 'weight' && day.blocks.length === 0 ? [emptyBlock()] : day.blocks,
                  })
                }
              />
            </View>
          </View>

          {day.kind === 'run' ? (
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              <Field label="거리" unit="km" value={day.distance} onChangeText={(v) => updateDay(day.weekday, { distance: v })} keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Field label="페이스" value={day.pace} onChangeText={(v) => updateDay(day.weekday, { pace: v })} digits placeholder="5:30" style={{ flex: 1 }} />
              <Field
                label="목표"
                unit="kcal"
                value={day.targetKcal}
                onChangeText={(v) => updateDay(day.weekday, { targetKcal: v })}
                keyboardType="number-pad"
                placeholder="자동"
                style={{ flex: 1 }}
              />
            </View>
          ) : null}

          {day.kind === 'weight' ? (
            <View style={{ gap: space(3) }}>
              <ExerciseBlocks blocks={day.blocks} onChange={(blocks) => updateDay(day.weekday, { blocks })} />
              <Field
                label="목표 칼로리 (선택)"
                unit="kcal"
                value={day.targetKcal}
                onChangeText={(v) => updateDay(day.weekday, { targetKcal: v })}
                keyboardType="number-pad"
                placeholder="자동"
                style={{ width: 180 }}
              />
            </View>
          ) : null}
        </Card>
      ))}

      <Message text={error} tone="error" />
      <Message text={notice} tone="ok" />
      <Button title={busy ? '저장하는 중…' : '계획 저장'} onPress={() => void save()} disabled={busy} />

      <View style={{ height: space(2) }} />
      <SectionTitle title="지난 계획" caption="계획을 고칠 때마다 버전이 남아요. 불러오면 그 내용으로 편집을 시작해요." />
      {plans.length === 0 ? <Message text="저장한 계획이 없어요." /> : null}
      {plans.length > 0 ? (
        <Card style={{ paddingVertical: space(1), gap: 0 }}>
          {plans.map((plan, index) => {
            const next = plans[index - 1]; // 목록이 최신부터라 바로 앞이 다음 버전
            const until = next ? formatShortDate(addDays(next.effective_from, -1)) : '';
            const isCurrent = plan.id === current?.id;
            const isFuture = plan.effective_from > today;
            const active = plan.days.filter((d) => d.kind !== 'rest');
            return (
              <View key={plan.id} style={{ gap: space(2), paddingVertical: space(3), borderTopWidth: index === 0 ? 0 : 1, borderTopColor: theme.line }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                  <T variant="numSm">
                    {formatShortDate(plan.effective_from)} ~ {until}
                  </T>
                  {isCurrent || isFuture ? (
                    <View style={{ backgroundColor: isCurrent ? theme.text : theme.rest.soft, borderRadius: radius.pill, paddingHorizontal: space(2), paddingVertical: 1 }}>
                      <T variant="small" color={isCurrent ? theme.bg : theme.text}>
                        {isCurrent ? '지금' : '예정'}
                      </T>
                    </View>
                  ) : null}
                  <T variant="caption" style={{ flex: 1 }} numberOfLines={1}>
                    {plan.title}
                  </T>
                </View>
                {active.length ? (
                  active.map((d) => (
                    <View key={d.weekday} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                      <KindDot kind={d.kind} size={8} />
                      <T variant="caption" color={theme.text}>
                        {weekdayLabel(d.weekday)} · {describePlan(d)}
                      </T>
                    </View>
                  ))
                ) : (
                  <T variant="caption">모두 휴식</T>
                )}
                <View style={{ flexDirection: 'row', gap: space(5) }}>
                  <TextButton
                    title="불러오기"
                    onPress={() => {
                      setDraft(toDraft(plan.effective_from > today ? plan.effective_from : today, plan));
                      setNotice('불러온 계획을 고쳐 저장하면 시작일부터 새 버전이 돼요.');
                    }}
                  />
                  <TextButton
                    title={confirmDelete === plan.id ? '정말 지울까요?' : '지우기'}
                    tone={confirmDelete === plan.id ? 'danger' : 'muted'}
                    onPress={() => void remove(plan)}
                  />
                </View>
              </View>
            );
          })}
        </Card>
      ) : null}
    </View>
  );
};
