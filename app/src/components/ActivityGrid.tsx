import React from 'react';
import { Pressable, View } from 'react-native';

import { KindMark } from '@/components/KindMark';
import { T } from '@/components/ui';
import { WEEKDAY_LABELS, formatDuration, formatKm, formatPace, weekdayLabel } from '@/lib/date';
import { LEVEL_ALPHA, alpha, radius, space, useTheme, type Theme } from '@/theme';
import type { CalendarDay, DayStatus, PlanDay, PlanKind, Session, WorkoutKind } from '@/types';

export const STATUS_LABELS: Record<DayStatus, string> = {
  rest: '휴식',
  planned: '예정',
  done: '완료',
  partial: '일부',
  missed: '못 함',
  extra: '추가 운동',
};

/** 그날의 운동 종류: 한 운동이 있으면 그것, 없으면 계획 */
export const dayKind = (day: Pick<CalendarDay, 'planned' | 'sessions'>): WorkoutKind | PlanKind | undefined =>
  day.sessions[0]?.kind ?? (day.planned && day.planned.kind !== 'rest' ? day.planned.kind : undefined);

interface CellLook {
  backgroundColor: string;
  borderColor: string;
  borderStyle: 'solid' | 'dashed';
  textColor: string;
}

/** 칸 모양: 진하기 = 달성 정도(검정의 농도). 못 한 날은 점선, 앞으로의 계획은 테두리, 휴식은 옅은 면 */
export const cellLook = (day: Pick<CalendarDay, 'status' | 'level'>, theme: Theme): CellLook => {
  switch (day.status) {
    case 'missed':
      return { backgroundColor: theme.paper, borderColor: theme.border, borderStyle: 'dashed', textColor: theme.muted };
    case 'planned':
      return { backgroundColor: theme.paper, borderColor: theme.ink, borderStyle: 'solid', textColor: theme.ink };
    case 'rest':
      return { backgroundColor: theme.sheet, borderColor: 'transparent', borderStyle: 'solid', textColor: theme.muted };
    default: {
      const level = Math.max(1, Math.min(4, day.level));
      return {
        backgroundColor: alpha(theme.ink, LEVEL_ALPHA[level] ?? 1),
        borderColor: 'transparent',
        borderStyle: 'solid',
        textColor: level >= 3 ? theme.onInk : theme.ink,
      };
    }
  }
};

/** 계획 한 줄 요약: 러닝 · 5km · 5'30" / 웨이트 · 3종목 12세트 */
export const describePlan = (planned?: PlanDay): string => {
  if (!planned || planned.kind === 'rest') return '휴식';
  if (planned.kind === 'run') {
    const parts = ['러닝'];
    if (planned.distance_km) parts.push(formatKm(planned.distance_km));
    if (planned.pace_sec_per_km) parts.push(formatPace(planned.pace_sec_per_km));
    return parts.join(' · ');
  }
  const exercises = planned.exercises ?? [];
  if (exercises.length === 0) return '웨이트';
  const sets = exercises.reduce((sum, e) => sum + e.sets, 0);
  return `웨이트 · ${new Set(exercises.map((e) => e.name)).size}종목 ${sets}세트`;
};

/** 기록 한 줄 요약: 5.2km · 26:10 · 5'02" / 스쿼트 외 2종목 · 12세트 */
export const describeSession = (s: Session): string => {
  if (s.kind === 'weight') {
    const names = [...new Set(s.sets.map((set) => set.exercise))];
    if (names.length === 0) return `${s.title}${s.duration_sec ? ` · ${formatDuration(s.duration_sec)}` : ''}`;
    const first = names[0] ?? '';
    return `${names.length > 1 ? `${first} 외 ${names.length - 1}종목` : first} · ${s.sets.length}세트`;
  }
  const parts: string[] = [];
  if (s.kind === 'other') parts.push(s.title);
  if (s.distance_km) parts.push(formatKm(s.distance_km));
  if (s.duration_sec) parts.push(formatDuration(s.duration_sec));
  if (s.kind === 'run' && s.distance_km && s.duration_sec) parts.push(formatPace(s.duration_sec / s.distance_km));
  return parts.join(' · ') || s.title;
};

/** 상태 한 마디: 일부는 달성률로 */
export const statusText = (day: Pick<CalendarDay, 'status' | 'achievement'>): string =>
  day.status === 'partial' ? `${Math.round(day.achievement * 100)}%` : STATUS_LABELS[day.status];

interface ActivityGridProps {
  mode: 'week' | 'month' | 'strip';
  days: CalendarDay[];
  /** month 모드: 이 달(YYYY-MM)이 아닌 앞뒤 날짜는 흐리게 */
  month?: string;
  today: string;
  selected?: string;
  onSelect: (date: string) => void;
}

/** 잔디. month = 달력, week = 하루 한 줄, strip = 홈의 이번 주 7칸 */
export const ActivityGrid = ({ mode, days, month, today, selected, onSelect }: ActivityGridProps) =>
  mode === 'week' ? (
    <WeekList days={days} today={today} selected={selected} onSelect={onSelect} />
  ) : (
    <MonthGrid days={days} month={month} today={today} selected={selected} onSelect={onSelect} strip={mode === 'strip'} />
  );

type GridProps = Omit<ActivityGridProps, 'mode'> & { strip?: boolean };

// 달력 모양 잔디. 칸 안에 날짜를 적어 며칠인지 바로 보이게 한다.
const MonthGrid = ({ days, month, today, selected, onSelect, strip }: GridProps) => {
  const theme = useTheme();
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <View style={{ gap: space(1.5) }}>
      <View style={{ flexDirection: 'row', gap: space(1.5) }}>
        {WEEKDAY_LABELS.map((label) => (
          <T key={label} variant="small" style={{ flex: 1, textAlign: 'center' }}>
            {label}
          </T>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]?.date} style={{ flexDirection: 'row', gap: space(1.5) }}>
          {week.map((day) => {
            const look = cellLook(day, theme);
            const outside = month !== undefined && !day.date.startsWith(month);
            const isSelected = !strip && day.date === selected;
            const isToday = day.date === today;
            return (
              <Pressable
                key={day.date}
                onPress={() => onSelect(day.date)}
                accessibilityRole="button"
                accessibilityLabel={`${day.date} ${STATUS_LABELS[day.status]}`}
                accessibilityState={{ selected: isSelected }}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  borderRadius: radius.cell,
                  backgroundColor: look.backgroundColor,
                  borderWidth: look.borderColor === 'transparent' ? 0 : 1.5,
                  borderColor: look.borderColor,
                  borderStyle: look.borderStyle,
                  opacity: outside ? 0.3 : 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <T variant="numSm" color={look.textColor}>
                  {Number(day.date.slice(8, 10))}
                </T>
                {/* 고른 칸 · 오늘은 칸 바깥 테두리로 (칸 안의 진하기를 가리지 않게) */}
                {isSelected || isToday ? (
                  <View
                    pointerEvents="none"
                    style={{
                      position: 'absolute',
                      top: -4,
                      left: -4,
                      right: -4,
                      bottom: -4,
                      borderRadius: radius.cell + 3,
                      borderWidth: 2,
                      borderColor: isSelected ? theme.ink : theme.muted,
                      borderStyle: isSelected ? 'solid' : 'dotted',
                    }}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
};

// 주 단위: 하루 한 줄로 계획과 한 일을 나란히 보여 준다.
const WeekList = ({ days, today, selected, onSelect }: GridProps) => {
  const theme = useTheme();
  return (
    <View style={{ gap: space(1) }}>
      {days.map((day) => {
        const look = cellLook(day, theme);
        const isSelected = day.date === selected;
        const done = day.sessions.map(describeSession).join(' / ');
        return (
          <Pressable
            key={day.date}
            onPress={() => onSelect(day.date)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space(3),
              padding: space(2),
              borderRadius: radius.box,
              backgroundColor: isSelected ? theme.sheet : 'transparent',
            }}
          >
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: radius.cell,
                backgroundColor: look.backgroundColor,
                borderWidth: look.borderColor === 'transparent' ? 0 : 1.5,
                borderColor: look.borderColor,
                borderStyle: look.borderStyle,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <T variant="small" color={look.textColor} style={{ lineHeight: 14 }}>
                {weekdayLabel(day.weekday)}
              </T>
              <T variant="numSm" color={look.textColor} style={{ textDecorationLine: day.date === today ? 'underline' : 'none' }}>
                {Number(day.date.slice(8, 10))}
              </T>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
                {dayKind(day) ? <KindMark kind={dayKind(day)} size={8} color={done ? theme.ink : theme.muted} /> : null}
                <T variant={done ? 'bodyStrong' : 'body'} color={done ? theme.ink : theme.muted} numberOfLines={1} style={{ flex: 1 }}>
                  {done || (day.status === 'missed' ? '기록 없음' : describePlan(day.planned))}
                </T>
              </View>
              {done ? (
                <T variant="caption" numberOfLines={1}>
                  계획 {describePlan(day.planned)}
                </T>
              ) : null}
            </View>
            <T variant="small" color={day.status === 'missed' ? theme.ink : theme.muted}>
              {statusText(day)}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
};

/** 범례: 진하기 = 달성, 테두리 = 예정, 점선 = 못 한 날, 기호 = 운동 종류 */
export const ActivityLegend = () => {
  const theme = useTheme();
  const swatch = (look: Partial<CellLook>) => (
    <View
      style={{
        width: 14,
        height: 14,
        borderRadius: 4,
        backgroundColor: look.backgroundColor,
        borderWidth: look.borderColor ? 1.5 : 0,
        borderColor: look.borderColor,
        borderStyle: look.borderStyle,
      }}
    />
  );
  const item = (key: string, mark: React.ReactNode, label: string) => (
    <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
      {mark}
      <T variant="small" style={{ fontWeight: '500' }}>
        {label}
      </T>
    </View>
  );
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: space(4), rowGap: space(2), alignItems: 'center' }}>
      {item(
        'level',
        <View style={{ flexDirection: 'row', gap: 2 }}>
          {[1, 2, 3, 4].map((l) => (
            <View key={l} style={{ width: 8, height: 14, borderRadius: 2, backgroundColor: alpha(theme.ink, LEVEL_ALPHA[l] ?? 1) }} />
          ))}
        </View>,
        '진할수록 계획을 채움',
      )}
      {item('planned', swatch({ backgroundColor: theme.paper, borderColor: theme.ink, borderStyle: 'solid' }), '예정')}
      {item('missed', swatch({ backgroundColor: theme.paper, borderColor: theme.border, borderStyle: 'dashed' }), '못 한 날')}
      {item('kinds', <T variant="small">● ■ ▲</T>, '러닝 · 웨이트 · 기타')}
    </View>
  );
};
