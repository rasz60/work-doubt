import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActivityGrid, ActivityLegend } from '@/components/ActivityGrid';
import { Card, Message, Segmented, T } from '@/components/ui';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatMonth,
  formatShortDate,
  monthOf,
  startOfMonth,
  startOfWeek,
  todayString,
} from '@/lib/date';
import { radius, space, useTheme } from '@/theme';

import { DayDetail } from './DayDetail';
import { useCalendar } from './useCalendar';

type Mode = 'week' | 'month';

const MODES: { value: Mode; label: string }[] = [
  { value: 'month', label: '월' },
  { value: 'week', label: '주' },
];

export const visibleRange = (mode: Mode, anchor: string): { from: string; to: string } => {
  if (mode === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  // 달력은 월요일부터 일요일까지 꽉 찬 주로 보여 준다
  const month = monthOf(anchor);
  return { from: startOfWeek(startOfMonth(month)), to: addDays(startOfWeek(endOfMonth(month)), 6) };
};

interface CalendarViewProps {
  onRecord: (date: string) => void;
  onPlan: () => void;
}

// 기록 › 캘린더: 월(달력) · 주(하루 한 줄로 계획과 한 일) 잔디.
export const CalendarView = ({ onRecord, onPlan }: CalendarViewProps) => {
  const theme = useTheme();
  const today = todayString();
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState<string>(today);
  const [selected, setSelected] = useState<string>(today);

  const { from, to } = visibleRange(mode, anchor);
  const month = monthOf(anchor);
  const { days, error } = useCalendar(from, to);

  const move = (step: number): void => {
    const next = mode === 'month' ? startOfMonth(addMonths(month, step)) : addDays(anchor, step * 7);
    setAnchor(next);
    const range = visibleRange(mode, next);
    if (selected < range.from || selected > range.to) setSelected(mode === 'month' ? next : range.from);
  };

  // 이 달 오늘까지 계획한 날 중 채운 날
  const monthDays = days.filter((d) => d.date.startsWith(month) && d.date <= today && d.planned);
  const doneDays = monthDays.filter((d) => d.status === 'done').length;
  const selectedDay = days.find((d) => d.date === selected);
  const label = mode === 'month' ? formatMonth(month) : `${formatShortDate(from)} – ${formatShortDate(to)}`;

  const arrow = (glyph: string, a11y: string, step: number) => (
    <Pressable
      onPress={() => move(step)}
      accessibilityLabel={a11y}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: radius.box,
        backgroundColor: theme.field,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <T variant="heading">{glyph}</T>
    </Pressable>
  );

  return (
    <View style={{ gap: space(4) }}>
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          {arrow('‹', '이전', -1)}
          <Pressable
            onPress={() => {
              setAnchor(today);
              setSelected(today);
            }}
            accessibilityLabel="오늘로"
            style={{ flex: 1, alignItems: 'center' }}
          >
            <T variant="heading">{label}</T>
          </Pressable>
          {arrow('›', '다음', 1)}
        </View>
        <View style={{ width: 120, alignSelf: 'center' }}>
          <Segmented options={MODES} value={mode} onChange={setMode} />
        </View>

        <Message text={error} tone="error" />
        <ActivityGrid mode={mode} days={days} month={mode === 'month' ? month : undefined} today={today} selected={selected} onSelect={setSelected} />
        <ActivityLegend />
        {mode === 'month' && monthDays.length > 0 ? (
          <T variant="label">
            {formatMonth(month)} 계획 {monthDays.length}일 중{' '}
            <T variant="label" color={theme.text} style={{ fontWeight: '800' }}>
              {doneDays}일
            </T>{' '}
            완료 (오늘까지)
          </T>
        ) : null}
      </Card>

      {selectedDay ? (
        <Card>
          <DayDetail day={selectedDay} onRecord={onRecord} onPlan={onPlan} />
        </Card>
      ) : null}
    </View>
  );
};
