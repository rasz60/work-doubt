import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ActivityGrid, ActivityLegend } from '@/components/ActivityGrid';
import { Message, Segmented } from '@/components/ui';
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
import { space, tracking, useTheme } from '@/theme';

import { DayDetail } from './DayDetail';
import { useCalendar } from './useCalendar';

type Mode = 'week' | 'month';

const MODES: { value: Mode; label: string }[] = [
  { value: 'week', label: '주' },
  { value: 'month', label: '월' },
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

// RECORD › 캘린더: 주(하루 한 줄로 계획과 한 일) · 월(달력) 잔디.
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

  return (
    <View style={{ gap: space(4) }}>
      <Segmented options={MODES} value={mode} onChange={setMode} />
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Pressable onPress={() => move(-1)} hitSlop={10} accessibilityLabel="이전">
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', paddingHorizontal: space(2) }}>‹</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setAnchor(today);
            setSelected(today);
          }}
          accessibilityLabel="오늘로"
        >
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', letterSpacing: tracking.tight }}>{label}</Text>
        </Pressable>
        <Pressable onPress={() => move(1)} hitSlop={10} accessibilityLabel="다음">
          <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', paddingHorizontal: space(2) }}>›</Text>
        </Pressable>
      </View>

      <Message text={error} tone="error" />
      <ActivityGrid mode={mode} days={days} month={mode === 'month' ? month : undefined} today={today} selected={selected} onSelect={setSelected} />
      <ActivityLegend />
      {mode === 'month' && monthDays.length > 0 ? (
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
          {formatMonth(month)} 계획 {monthDays.length}일 중 {doneDays}일 완료 (오늘까지)
        </Text>
      ) : null}

      {selectedDay ? <DayDetail day={selectedDay} onRecord={onRecord} onPlan={onPlan} /> : null}
    </View>
  );
};
