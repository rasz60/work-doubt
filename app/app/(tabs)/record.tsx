import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Heading, Message, Screen, Segmented } from '@/components/ui';
import * as api from '@/api/endpoints';
import { BodyForm } from '@/features/record/BodyForm';
import { PlanEditor } from '@/features/record/PlanEditor';
import { SessionForm } from '@/features/record/SessionForm';
import { isDateString } from '@/lib/date';
import { space } from '@/theme';
import type { Plan } from '@/types';

type Tab = 'log' | 'plan' | 'body';

const TABS: { value: Tab; label: string }[] = [
  { value: 'log', label: '수행 기록' },
  { value: 'plan', label: '운동 계획' },
  { value: 'body', label: '신체' },
];

const HEADINGS: Record<Tab, { eyebrow: string; title: string }> = {
  log: { eyebrow: 'Record · Log', title: '수행 기록' },
  plan: { eyebrow: 'Record · Plan', title: '운동 계획' },
  body: { eyebrow: 'Record · Body', title: '신체 지표' },
};

const isTab = (value: unknown): value is Tab => value === 'log' || value === 'plan' || value === 'body';

// RECORD: 일자별 수행 기록 · 주간 운동 계획(이력) · 신체 지표.
// HOME 의 잔디에서 날짜를 눌러 들어오면 ?tab=log&date=YYYY-MM-DD 로 그 날짜 기록을 시작한다.
const Record = () => {
  const params = useLocalSearchParams<{ tab?: string; date?: string }>();
  const scrollRef = useRef<ScrollView>(null);

  const [tab, setTab] = useState<Tab>(isTab(params.tab) ? params.tab : 'log');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isTab(params.tab)) setTab(params.tab);
  }, [params.tab, params.date]);

  const loadPlans = useCallback(async (): Promise<void> => {
    try {
      setPlans((await api.fetchPlans()).items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '계획을 불러오지 못했습니다.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPlans();
    }, [loadPlans]),
  );

  const date = typeof params.date === 'string' && isDateString(params.date) ? params.date : undefined;

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ gap: space(5), paddingBottom: space(8), width: '100%', maxWidth: 720, alignSelf: 'center' }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Heading eyebrow={HEADINGS[tab].eyebrow} title={HEADINGS[tab].title} />
        <Segmented options={TABS} value={tab} onChange={setTab} />
        <Message text={error} tone="error" />

        {/* 탭을 오가도 쓰던 입력이 남도록 셋 다 띄워 두고 보이는 것만 바꾼다 */}
        <View style={{ display: tab === 'log' ? 'flex' : 'none' }}>
          <SessionForm plans={plans} initialDate={date} onEditStart={() => scrollRef.current?.scrollTo({ y: 0, animated: true })} />
        </View>
        <View style={{ display: tab === 'plan' ? 'flex' : 'none' }}>
          <PlanEditor plans={plans} onSaved={loadPlans} />
        </View>
        <View style={{ display: tab === 'body' ? 'flex' : 'none' }}>
          <BodyForm />
        </View>
      </ScrollView>
    </Screen>
  );
};

export default Record;
