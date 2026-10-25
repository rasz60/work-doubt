import React from 'react';
import { Text, View } from 'react-native';

import { STATUS_LABELS, describePlan, describeSession } from '@/components/ActivityGrid';
import { SectionTitle, TextButton } from '@/components/ui';
import { formatLongDate } from '@/lib/date';
import { space, useTheme } from '@/theme';
import { KIND_LABELS, SOURCE_LABELS, type CalendarDay } from '@/types';

interface DayDetailProps {
  day: CalendarDay;
  onRecord: (date: string) => void;
  onPlan: () => void;
}

// 잔디에서 고른 하루: 계획 · 한 일 · 달성.
export const DayDetail = ({ day, onRecord, onPlan }: DayDetailProps) => {
  const theme = useTheme();
  const status = day.status === 'partial' ? `일부 ${Math.round(day.achievement * 100)}%` : STATUS_LABELS[day.status];

  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle title={formatLongDate(day.date)} right={<Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{status}</Text>} />
      <Text style={{ color: theme.textMuted, fontSize: 13 }}>계획 · {describePlan(day.planned)}</Text>
      {day.sessions.length === 0 ? (
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>기록 없음</Text>
      ) : (
        day.sessions.map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', gap: space(2), alignItems: 'baseline' }}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800', width: 44 }}>{KIND_LABELS[s.kind]}</Text>
            <Text style={{ color: theme.text, fontSize: 13, flex: 1 }}>{describeSession(s)}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>{SOURCE_LABELS[s.source]}</Text>
          </View>
        ))
      )}
      <View style={{ flexDirection: 'row', gap: space(4) }}>
        <TextButton title="+ 이날 기록하기" onPress={() => onRecord(day.date)} />
        {!day.planned ? <TextButton title="계획 세우기" tone="muted" onPress={onPlan} /> : null}
      </View>
    </View>
  );
};
