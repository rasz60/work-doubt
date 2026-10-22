import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { WEEKDAY_LABELS, formatDuration, formatKm, formatPace, formatShortDate, weekdayLabel } from '@/lib/date';
import { space, tracking, useTheme, type Theme } from '@/theme';
import type { CalendarDay, DayStatus, PlanDay, Session } from '@/types';

// 잔디 진하기 (0~4). 모노크롬이라 회색 단계로 나눈다. 0 은 계획 · 기록이 없는 날.
const RAMP_LIGHT = ['#f3f3f3', '#d9d9d9', '#a6a6a6', '#595959', '#000000'] as const;
const RAMP_DARK = ['#141414', '#3a3a3a', '#6b6b6b', '#b0b0b0', '#ffffff'] as const;

export const STATUS_LABELS: Record<DayStatus, string> = {
  rest: '휴식',
  planned: '예정',
  done: '완료',
  partial: '일부',
  missed: '미수행',
  extra: '추가 운동',
};

const ramp = (theme: Theme): readonly string[] => (theme.bg === '#000000' ? RAMP_DARK : RAMP_LIGHT);

interface CellLook {
  backgroundColor: string;
  borderColor: string;
  borderStyle: 'solid' | 'dashed';
  textColor: string;
}

/** 칸 모양: 채운 정도는 회색 단계, 지난 계획을 안 한 날은 점선 테두리, 앞으로의 계획은 옅은 테두리 */
export const cellLook = (day: Pick<CalendarDay, 'status' | 'level'>, theme: Theme): CellLook => {
  const colors = ramp(theme);
  const dark = day.level >= 3;
  switch (day.status) {
    case 'missed':
      return { backgroundColor: theme.bg, borderColor: theme.text, borderStyle: 'dashed', textColor: theme.textMuted };
    case 'planned':
      return { backgroundColor: theme.bg, borderColor: theme.textMuted, borderStyle: 'solid', textColor: theme.text };
    case 'rest':
      return { backgroundColor: colors[0] ?? theme.grid, borderColor: 'transparent', borderStyle: 'solid', textColor: theme.textMuted };
    default:
      return {
        backgroundColor: colors[Math.max(1, Math.min(4, day.level))] ?? theme.text,
        borderColor: 'transparent',
        borderStyle: 'solid',
        textColor: dark ? theme.bg : theme.text,
      };
  }
};

const kindMark = (planned?: PlanDay): string => (planned?.kind === 'run' ? 'R' : planned?.kind === 'weight' ? 'W' : '');

/** 계획 한 줄 요약: 러닝 5km · 5'30" / 웨이트 3종목 12세트 */
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

/** 기록 한 줄 요약: 5.2km · 26:10 · 5'02" / 스쿼트 외 2종목 12세트 */
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

interface ActivityGridProps {
  mode: 'week' | 'month';
  days: CalendarDay[];
  /** month 모드: 이 달(YYYY-MM)이 아닌 앞뒤 날짜는 흐리게 */
  month?: string;
  today: string;
  selected: string;
  onSelect: (date: string) => void;
}

export const ActivityGrid = ({ mode, days, month, today, selected, onSelect }: ActivityGridProps) =>
  mode === 'month' ? (
    <MonthGrid days={days} month={month} today={today} selected={selected} onSelect={onSelect} />
  ) : (
    <WeekList days={days} today={today} selected={selected} onSelect={onSelect} />
  );

type GridProps = Omit<ActivityGridProps, 'mode'>;

// 달력 모양 잔디. 칸 안에 날짜를 적어 몇 월 며칠인지 바로 보이게 한다.
const MonthGrid = ({ days, month, today, selected, onSelect }: GridProps) => {
  const theme = useTheme();
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <View style={{ gap: space(1) }}>
      <View style={{ flexDirection: 'row', gap: space(1) }}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={{ flex: 1, textAlign: 'center', color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>
            {label}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week[0]?.date} style={{ flexDirection: 'row', gap: space(1) }}>
          {week.map((day) => {
            const look = cellLook(day, theme);
            const outside = month !== undefined && !day.date.startsWith(month);
            const isSelected = day.date === selected;
            const isToday = day.date === today;
            return (
              <Pressable
                key={day.date}
                onPress={() => onSelect(day.date)}
                accessibilityRole="button"
                accessibilityLabel={`${day.date} ${STATUS_LABELS[day.status]}`}
                style={{
                  flex: 1,
                  aspectRatio: 1,
                  backgroundColor: look.backgroundColor,
                  borderWidth: isSelected ? 2 : 1,
                  borderColor: isSelected ? theme.text : look.borderColor,
                  borderStyle: isSelected ? 'solid' : look.borderStyle,
                  opacity: outside ? 0.3 : 1,
                  padding: 3,
                  justifyContent: 'space-between',
                }}
              >
                <Text
                  style={{
                    color: look.textColor,
                    fontSize: 11,
                    fontWeight: isToday ? '900' : '600',
                    textDecorationLine: isToday ? 'underline' : 'none',
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {Number(day.date.slice(8, 10))}
                </Text>
                <Text style={{ color: look.textColor, fontSize: 8, fontWeight: '800', alignSelf: 'flex-end', letterSpacing: 0.5 }}>
                  {day.status === 'extra' ? '+' : kindMark(day.planned)}
                </Text>
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
    <View>
      {days.map((day) => {
        const look = cellLook(day, theme);
        const isSelected = day.date === selected;
        const done = day.sessions.map(describeSession).join(' / ');
        return (
          <Pressable
            key={day.date}
            onPress={() => onSelect(day.date)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: space(3),
              paddingVertical: space(2.5),
              paddingHorizontal: space(1),
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
              backgroundColor: isSelected ? theme.grid : 'transparent',
            }}
          >
            <View
              style={{
                width: 40,
                height: 40,
                backgroundColor: look.backgroundColor,
                borderWidth: 1,
                borderColor: look.borderColor,
                borderStyle: look.borderStyle,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: look.textColor, fontSize: 10, fontWeight: '700' }}>{weekdayLabel(day.weekday)}</Text>
              <Text
                style={{
                  color: look.textColor,
                  fontSize: 13,
                  fontWeight: '800',
                  textDecorationLine: day.date === today ? 'underline' : 'none',
                }}
              >
                {Number(day.date.slice(8, 10))}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text style={{ color: theme.textMuted, fontSize: 11 }} numberOfLines={1}>
                {formatShortDate(day.date)} 계획 · {describePlan(day.planned)}
              </Text>
              <Text style={{ color: done ? theme.text : theme.textMuted, fontSize: 13, fontWeight: done ? '700' : '400' }} numberOfLines={1}>
                {done || (day.status === 'missed' ? '기록 없음' : '-')}
              </Text>
            </View>
            <Text style={{ color: day.status === 'missed' ? theme.text : theme.textMuted, fontSize: 11, fontWeight: '700' }}>
              {day.status === 'partial' ? `${Math.round(day.achievement * 100)}%` : STATUS_LABELS[day.status]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

// 범례
export const ActivityLegend = () => {
  const theme = useTheme();
  const items: { label: string; day: Pick<CalendarDay, 'status' | 'level'> }[] = [
    { label: '휴식', day: { status: 'rest', level: 0 } },
    { label: '예정', day: { status: 'planned', level: 0 } },
    { label: '미수행', day: { status: 'missed', level: 0 } },
    { label: '일부', day: { status: 'partial', level: 2 } },
    { label: '완료', day: { status: 'done', level: 4 } },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(3), alignItems: 'center' }}>
      {items.map(({ label, day }) => {
        const look = cellLook(day, theme);
        return (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
            <View
              style={{
                width: 12,
                height: 12,
                backgroundColor: look.backgroundColor,
                borderWidth: 1,
                borderColor: look.borderColor,
                borderStyle: look.borderStyle,
              }}
            />
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>{label}</Text>
          </View>
        );
      })}
      <Text style={{ color: theme.textMuted, fontSize: 11, letterSpacing: tracking.label }}>R 러닝 · W 웨이트 · + 추가</Text>
    </View>
  );
};
