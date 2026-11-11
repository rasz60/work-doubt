import React from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { describePlan, describeSession, statusText } from '@/components/ActivityGrid';
import { KindMark } from '@/components/KindMark';
import { Button, Group, Row, T, TextButton } from '@/components/ui';
import { formatLongDate, todayString } from '@/lib/date';
import { space, useTheme } from '@/theme';
import { SOURCE_LABELS, type CalendarDay } from '@/types';

// 잔디에서 고른 하루: 계획 · 한 운동(누르면 고치기) · 이날 기록하기.
export const DayDetail = ({ day }: { day: CalendarDay }) => {
  const theme = useTheme();
  const future = day.date > todayString();

  return (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2), paddingHorizontal: space(1) }}>
        <T variant="heading" style={{ flex: 1 }}>
          {formatLongDate(day.date)}
        </T>
        <T variant="label" color={day.status === 'missed' ? theme.ink : theme.muted}>
          {statusText(day)}
        </T>
      </View>
      <Group flush>
        <Row first left={<KindMark kind={day.planned?.kind ?? 'rest'} size={8} color={theme.muted} />} title={`계획 · ${describePlan(day.planned)}`} />
        {day.sessions.map((s) => (
          <Row
            key={s.id}
            left={<KindMark kind={s.kind} size={9} />}
            title={describeSession(s)}
            meta={[s.source !== 'manual' ? SOURCE_LABELS[s.source] : '', s.memo ?? ''].filter(Boolean).join(' · ') || undefined}
            onPress={() => router.push({ pathname: '/log', params: { id: s.id, date: s.performed_on } })}
            accessibilityLabel={`${describeSession(s)} 고치기`}
          />
        ))}
        {day.sessions.length === 0 && !future ? <Row title="기록 없음" /> : null}
      </Group>
      {!future ? <Button title="이날 기록하기" variant="secondary" onPress={() => router.push({ pathname: '/log', params: { date: day.date } })} /> : null}
      {!day.planned ? <TextButton title="주간 계획 세우기 ›" tone="muted" onPress={() => router.push('/plan')} /> : null}
    </View>
  );
};
