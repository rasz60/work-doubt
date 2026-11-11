import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { describePlan } from '@/components/ActivityGrid';
import { KindMark } from '@/components/KindMark';
import { Group, Header, Message, Page, Screen, T, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { usePlanDraft } from '@/features/record/PlanDraftContext';
import { toDraft } from '@/features/record/plan';
import { addDays, formatShortDate, todayString, weekdayLabel } from '@/lib/date';
import { radius, space, useTheme } from '@/theme';
import type { Plan } from '@/types';

// 지난 계획: 버전마다 기간 · 요일 요약. 불러오면 그 내용으로 편집을 시작하고, 지울 수 있다.
const PlanHistory = () => {
  const theme = useTheme();
  const today = todayString();
  const { plans, reload, setDraft } = usePlanDraft();
  const [confirmDelete, setConfirmDelete] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');
  const current = plans.find((p) => p.effective_from <= today);

  const remove = async (plan: Plan): Promise<void> => {
    if (confirmDelete !== plan.id) {
      setConfirmDelete(plan.id);
      return;
    }
    setConfirmDelete('');
    setError('');
    try {
      await api.deletePlan(plan.id);
      await reload();
      setNotice(`${formatShortDate(plan.effective_from)} 버전을 지웠어요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '지우지 못했습니다.');
    }
  };

  return (
    <Screen>
      <Page>
        <Header back="계획" fallback="/plan" title="지난 계획" />
        <T variant="caption">계획을 고칠 때마다 버전이 남아요. 불러오면 그 내용으로 편집을 시작해요.</T>
        <Message text={error} tone="error" />
        <Message text={notice} tone="ok" />
        {plans.length === 0 ? <Message text="저장한 계획이 없어요." /> : null}

        {plans.map((plan, index) => {
          const next = plans[index - 1]; // 목록이 최신부터라 바로 앞이 다음 버전
          const until = next ? formatShortDate(addDays(next.effective_from, -1)) : '';
          const isCurrent = plan.id === current?.id;
          const isFuture = plan.effective_from > today;
          const active = plan.days.filter((d) => d.kind !== 'rest');
          return (
            <Group key={plan.id} style={{ gap: space(3) }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                <T variant="numMd">
                  {formatShortDate(plan.effective_from)} ~ {until}
                </T>
                {isCurrent || isFuture ? (
                  <View style={{ backgroundColor: isCurrent ? theme.cream : theme.field, paddingHorizontal: space(2.5), paddingVertical: 2, borderWidth: 3, borderColor: theme.outline }}>
                    <T variant="small" color={isCurrent ? theme.onCream : theme.ink}>
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
                    <KindMark kind={d.kind} size={8} />
                    <T variant="caption" color={theme.ink}>
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
                    if (router.canGoBack()) router.back();
                    else router.replace('/plan');
                  }}
                />
                <TextButton
                  title={confirmDelete === plan.id ? '정말 지울까요?' : '지우기'}
                  tone={confirmDelete === plan.id ? 'danger' : 'muted'}
                  onPress={() => void remove(plan)}
                />
              </View>
            </Group>
          );
        })}
      </Page>
    </Screen>
  );
};

export default PlanHistory;
