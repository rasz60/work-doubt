import React from 'react';
import { View } from 'react-native';

import { describePlan, describeSession, statusText } from '@/components/ActivityGrid';
import { KindDot, T, TextButton } from '@/components/ui';
import { formatLongDate, todayString } from '@/lib/date';
import { space, useTheme } from '@/theme';
import { SOURCE_LABELS, type CalendarDay } from '@/types';

interface DayDetailProps {
  day: CalendarDay;
  onRecord: (date: string) => void;
  onPlan: () => void;
}

// 잔디에서 고른 하루: 계획 · 한 일 · 달성.
export const DayDetail = ({ day, onRecord, onPlan }: DayDetailProps) => {
  const theme = useTheme();
  const future = day.date > todayString();

  return (
    <View style={{ gap: space(2.5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2) }}>
        <T variant="heading" style={{ flex: 1 }}>
          {formatLongDate(day.date)}
        </T>
        <T variant="small" color={day.status === 'missed' ? theme.text : theme.textMuted}>
          {statusText(day)}
        </T>
      </View>
      <T variant="caption">계획 · {describePlan(day.planned)}</T>
      {day.sessions.map((s) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <KindDot kind={s.kind} />
          <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
            {describeSession(s)}
          </T>
          <T variant="small" style={{ fontWeight: '500' }}>
            {SOURCE_LABELS[s.source]}
          </T>
        </View>
      ))}
      {day.sessions.length === 0 && !future ? <T variant="body" color={theme.textMuted}>기록 없음</T> : null}
      <View style={{ flexDirection: 'row', gap: space(5) }}>
        {!future ? <TextButton title="이날 기록하기" onPress={() => onRecord(day.date)} /> : null}
        {!day.planned ? <TextButton title="계획 세우기" tone="muted" onPress={onPlan} /> : null}
      </View>
    </View>
  );
};
