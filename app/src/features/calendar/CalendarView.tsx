import React, { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ActivityGrid, ActivityLegend } from '@/components/ActivityGrid';
import { Message, Segmented, T } from '@/components/ui';
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
import { space, useTheme } from '@/theme';

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

// 캘린더: 월(달력) · 주(하루 한 줄로 계획과 한 일) 잔디 + 고른 날.
export const CalendarView = ({ initialDate }: { initialDate?: string }) => {
  const theme = useTheme();
  const today = todayString();
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState<string>(initialDate ?? today);
  const [selected, setSelected] = useState<string>(initialDate ?? today);

  // 오늘 화면에서 날짜를 눌러 들어오면 그 날짜를 고른다
  useEffect(() => {
    if (!initialDate) return;
    setAnchor(initialDate);
    setSelected(initialDate);
  }, [initialDate]);

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
  const monthDays = days.filter((d) => d.date.startsWith(month) && d.date <= today && d.planned && d.planned.kind !== 'rest');
  const doneDays = monthDays.filter((d) => d.status === 'done').length;
  const selectedDay = days.find((d) => d.date === selected);
  const label = mode === 'month' ? formatMonth(month) : `${formatShortDate(from)} – ${formatShortDate(to)}`;

  const arrow = (glyph: string, a11y: string, step: number) => (
    <Pressable
      onPress={() => move(step)}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={8}
      style={({ pressed }) => ({ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
    >
      <T variant="heading" style={{ fontSize: 26, fontWeight: '400' }}>
        {glyph}
      </T>
    </Pressable>
  );

  return (
    <View style={{ gap: space(6) }}>
      <View style={{ gap: space(4) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
          {arrow('‹', mode === 'month' ? '이전 달' : '이전 주', -1)}
          <Pressable
            onPress={() => {
              setAnchor(today);
              setSelected(today);
            }}
            accessibilityRole="button"
            accessibilityLabel="오늘로"
            style={{ flex: 1, alignItems: 'center' }}
          >
            <T variant="heading">{label}</T>
          </Pressable>
          {arrow('›', mode === 'month' ? '다음 달' : '다음 주', 1)}
          <View style={{ width: 96 }}>
            <Segmented options={MODES} value={mode} onChange={setMode} />
          </View>
        </View>

        <Message text={error} tone="error" />
        <ActivityGrid mode={mode} days={days} month={mode === 'month' ? month : undefined} today={today} selected={selected} onSelect={setSelected} />
        {mode === 'month' && monthDays.length > 0 ? (
          <T variant="label">
            {Number(month.slice(5, 7))}월 계획 {monthDays.length}일 중{' '}
            <T variant="label" color={theme.ink} style={{ fontWeight: '800' }}>
              {doneDays}일
            </T>{' '}
            완료 (오늘까지)
          </T>
        ) : null}
        <ActivityLegend />
      </View>

      {selectedDay ? <DayDetail day={selectedDay} /> : null}
    </View>
  );
};
