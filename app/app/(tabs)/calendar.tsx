import React, { useCallback, useState } from 'react';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';

import { describeSession } from '@/components/ActivityGrid';
import { KindMark } from '@/components/KindMark';
import { Group, Heading, Message, Page, Row, Screen, Section } from '@/components/ui';
import * as api from '@/api/endpoints';
import { CalendarView } from '@/features/calendar/CalendarView';
import { addDays, formatLongDate, isDateString, todayString } from '@/lib/date';
import { SOURCE_LABELS, type Session } from '@/types';

// 캘린더: 잔디(월 · 주) + 고른 날 + 최근 2주 기록. 기록을 누르면 고치기(/log?id=)
const Calendar = () => {
  const params = useLocalSearchParams<{ date?: string }>();
  const today = todayString();
  const initialDate = typeof params.date === 'string' && isDateString(params.date) ? params.date : undefined;
  const [recent, setRecent] = useState<Session[]>([]);
  const [error, setError] = useState<string>('');

  // 기록 화면에서 돌아올 때마다 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      api
        .fetchSessions(addDays(today, -13), today)
        .then(({ items }) => {
          setRecent([...items].reverse());
          setError('');
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : '기록을 불러오지 못했습니다.'));
    }, [today]),
  );

  return (
    <Screen>
      <Page>
        <Heading title="캘린더" />
        <CalendarView initialDate={initialDate} />

        <Section title="최근 2주">
          <Message text={error} tone="error" />
          {recent.length === 0 && !error ? <Message text="최근 2주 기록이 없어요." /> : null}
          {recent.length > 0 ? (
            <Group flush>
              {recent.map((s, i) => (
                <Row
                  key={s.id}
                  first={i === 0}
                  left={<KindMark kind={s.kind} size={9} />}
                  title={describeSession(s)}
                  meta={[formatLongDate(s.performed_on), s.source !== 'manual' ? SOURCE_LABELS[s.source] : '', s.memo ?? ''].filter(Boolean).join(' · ')}
                  onPress={() => router.push({ pathname: '/log', params: { id: s.id, date: s.performed_on } })}
                  accessibilityLabel={`${formatLongDate(s.performed_on)} ${describeSession(s)} 고치기`}
                />
              ))}
            </Group>
          ) : null}
        </Section>
      </Page>
    </Screen>
  );
};

export default Calendar;
