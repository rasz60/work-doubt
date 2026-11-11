import React, { useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Button, DatePicker, Field, Group, Header, Loading, Message, Page, Row, Screen, StickyFooter, T, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { usePlanDraft } from '@/features/record/PlanDraftContext';
import { describeDayDraft, examplePlan, fromDraft, isEmptyDraft } from '@/features/record/plan';
import { formatShortDate, todayString, weekdayLabel } from '@/lib/date';
import { space } from '@/theme';

// 주간 계획: 요일 7줄 요약. 요일을 누르면 그 요일만 고치고, 적용 시작일과 함께 한 번에 저장한다.
// 저장할 때마다 새 버전이 쌓인다 (지난 잔디는 그때 계획으로 채점).
const PlanOverview = () => {
  const today = todayString();
  const { plans, loading, error: loadError, reload, draft, setDraft, dirty, setDirty } = usePlanDraft();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [showTitle, setShowTitle] = useState<boolean>(false);

  const save = async (): Promise<void> => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const saved = await api.savePlan(fromDraft(draft));
      await reload();
      setDirty(false);
      setNotice(`${formatShortDate(saved.effective_from)}부터 이 계획으로 잔디를 채워요.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '계획을 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Page footerSpace>
        <Header
          title="주간 계획"
          back="뒤로"
          right={plans.length > 0 ? <TextButton title="지난 계획" onPress={() => router.push('/plan/history')} /> : null}
        />

        {loading ? <Loading /> : null}
        <Message text={loadError} tone="error" />

        <Group flush>
          {draft.days.map((day, i) => (
            <Row
              key={day.weekday}
              first={i === 0}
              left={<T variant="bodyStrong">{weekdayLabel(day.weekday)}</T>}
              title={describeDayDraft(day)}
              onPress={() => router.push({ pathname: '/plan/[weekday]', params: { weekday: String(day.weekday) } })}
              accessibilityLabel={`${weekdayLabel(day.weekday)}요일 계획 고치기`}
            />
          ))}
        </Group>

        {isEmptyDraft(draft) ? (
          <TextButton title="예시로 채우기 · 월수금 러닝, 토일 웨이트" tone="muted" onPress={() => setDraft(examplePlan(draft.effectiveFrom))} />
        ) : null}

        <View style={{ gap: space(3) }}>
          <T variant="label">적용 시작일</T>
          <DatePicker value={draft.effectiveFrom} onChange={(v) => setDraft((p) => ({ ...p, effectiveFrom: v }))} />
          <T variant="caption">이 날부터 새 계획으로 잔디를 채워요. 그 전 날은 예전 계획 그대로예요.</T>
          {showTitle || draft.title ? (
            <Field label="계획 이름 (선택)" value={draft.title} onChangeText={(v) => setDraft((p) => ({ ...p, title: v }))} placeholder="가을 10K 준비" />
          ) : (
            <TextButton title="+ 계획 이름" tone="muted" onPress={() => setShowTitle(true)} />
          )}
        </View>

        <Message text={error} tone="error" />
        <Message text={notice} tone="ok" />
        {dirty ? <T variant="caption">저장하지 않은 변경이 있어요.</T> : null}
      </Page>
      <StickyFooter>
        <Button title={busy ? '저장하는 중…' : draft.effectiveFrom > today ? `${formatShortDate(draft.effectiveFrom)}부터 쓰도록 저장` : '계획 저장'} onPress={() => void save()} disabled={busy} />
      </StickyFooter>
    </Screen>
  );
};

export default PlanOverview;
