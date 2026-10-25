import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ActivityGrid, ActivityLegend, describePlan, describeSession, statusText } from '@/components/ActivityGrid';
import { TrendChart } from '@/components/TrendChart';
import { Button, Card, Heading, KindDot, Message, Page, ProgressBar, Screen, SectionTitle, Stat, T, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { DayDetail } from '@/features/calendar/DayDetail';
import { useCalendar } from '@/features/calendar/useCalendar';
import { useAuth } from '@/hooks/useAuth';
import { addDays, formatKm, formatLongDate, formatMonth, formatNumber, formatPace, formatShortDate, monthOf, startOfWeek, todayString } from '@/lib/date';
import { radius, space, useTheme } from '@/theme';
import type { ActivitySummary, CalendarDay, ExerciseStat } from '@/types';

const signed = (n: number, digits = 1): string => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

// t 는 같은 탭 · 날짜로 다시 눌러도 기록 탭이 알아채게 붙인다
const goRecord = (params: Record<string, string>): void =>
  router.push({ pathname: '/record', params: { ...params, t: String(Date.now()) } });

// 홈: ① 오늘 할 운동 + 기록하기 ② 이번 주 잔디 ③ 칼로리 · 러닝 · 웨이트 요약
const Home = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const today = todayString();

  const [weekStart, setWeekStart] = useState<string>(startOfWeek(today));
  const [selected, setSelected] = useState<string>(today);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [summaryError, setSummaryError] = useState<string>('');
  const [exercise, setExercise] = useState<string>('');
  const [width, setWidth] = useState<number>(0);

  const weekEnd = addDays(weekStart, 6);
  const month = monthOf(today);
  const { days, loading, error, reload } = useCalendar(weekStart, weekEnd);

  const loadSummary = useCallback(async (): Promise<void> => {
    try {
      setSummary(await api.fetchActivitySummary(month));
      setSummaryError('');
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.');
    }
  }, [month]);

  useFocusEffect(
    useCallback(() => {
      void loadSummary();
    }, [loadSummary]),
  );

  // 연결한 앱(Strava)에서 새 활동을 받아 온다. 서버가 10분에 한 번만 실제로 가져온다
  useEffect(() => {
    void api
      .runSync(false)
      .then(({ connections }) => {
        const fresh = connections.some(
          (c) => c.provider === 'strava' && c.last_synced_at && Date.now() - new Date(c.last_synced_at).getTime() < 60_000,
        );
        if (fresh) {
          void reload();
          void loadSummary();
        }
      })
      .catch(() => undefined); // 동기화 실패는 내 정보의 연결 상태에 남는다
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const moveWeek = (step: number): void => {
    const next = addDays(weekStart, step * 7);
    setWeekStart(next);
    setSelected(next <= today && today <= addDays(next, 6) ? today : next);
  };

  const todayDay = days.find((d) => d.date === today);
  const selectedDay = days.find((d) => d.date === selected);
  const exercises = summary?.exercises ?? [];
  const activeExercise = exercises.find((e) => e.name === exercise) ?? exercises[0];
  const isThisWeek = weekStart === startOfWeek(today);

  return (
    <Screen>
      <Page
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              void reload();
              void loadSummary();
            }}
            tintColor={theme.text}
          />
        }
      >
        {/* 차트 폭 = 본문 폭 − 카드 안쪽 여백(양쪽) − 종류 색 띠 */}
        <View onLayout={(e) => setWidth(e.nativeEvent.layout.width - space(8) - 4)}>
          <Heading overline={formatLongDate(today)} title={user?.display_name ? `${user.display_name}님, 오늘은` : '오늘은'} />
        </View>

        <Message text={error || summaryError} tone="error" />

        {loading && !todayDay && isThisWeek ? <ActivityIndicator color={theme.text} /> : null}
        {isThisWeek && todayDay ? <TodayCard day={todayDay} /> : null}

        {/* 이번 주 잔디 */}
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
            <WeekArrow glyph="‹" label="지난주" onPress={() => moveWeek(-1)} />
            <Pressable
              onPress={() => {
                setWeekStart(startOfWeek(today));
                setSelected(today);
              }}
              accessibilityLabel="이번 주로"
              style={{ flex: 1, alignItems: 'center' }}
            >
              <T variant="heading">{isThisWeek ? '이번 주' : formatMonth(monthOf(weekStart))}</T>
              <T variant="small" style={{ fontWeight: '500' }}>
                {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
              </T>
            </Pressable>
            <WeekArrow glyph="›" label="다음 주" onPress={() => moveWeek(1)} />
          </View>

          <ActivityGrid mode="month" days={days} today={today} selected={selected} onSelect={setSelected} />
          <ActivityLegend />

          {summary && !summary.current_plan_id ? (
            <Message text="운동 계획이 없어 잔디가 비어 있어요. 기록 › 계획에서 요일별 루틴을 정해 보세요." />
          ) : null}
          {selectedDay && selected !== today ? (
            <View style={{ borderTopWidth: 1, borderTopColor: theme.line, paddingTop: space(3) }}>
              <DayDetail day={selectedDay} onRecord={(date) => goRecord({ tab: 'log', date })} onPlan={() => goRecord({ tab: 'plan' })} />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            {summary && summary.planned_days > 0 ? (
              <T variant="label">
                {formatMonth(summary.month)} 계획 {summary.planned_days}일 중{' '}
                <T variant="label" color={theme.text} style={{ fontWeight: '800' }}>
                  {summary.done_days}일
                </T>{' '}
                완료
              </T>
            ) : (
              <View />
            )}
            <TextButton title="캘린더 보기" onPress={() => goRecord({ tab: 'calendar' })} />
          </View>
        </Card>

        {summary ? (
          <>
            <CaloriesCard summary={summary} />
            <RunCard summary={summary} width={width} />
            <WeightCard exercises={exercises} active={activeExercise} onSelect={setExercise} width={width} />
          </>
        ) : null}
      </Page>
    </Screen>
  );
};

const WeekArrow = ({ glyph, label, onPress }: { glyph: string; label: string; onPress: () => void }) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
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
};

/** 오늘 할 운동: 계획 · 한 일 · 기록하기 */
const TodayCard = ({ day }: { day: CalendarDay }) => {
  const theme = useTheme();
  const planned = day.planned && day.planned.kind !== 'rest' ? day.planned : undefined;
  const kind = day.sessions[0]?.kind ?? planned?.kind;
  const done = day.sessions.length > 0;

  return (
    <Card kind={kind ?? 'rest'} style={{ gap: space(4) }}>
      <View style={{ gap: space(1) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <T variant="label" style={{ flex: 1 }}>
            {planned ? '오늘 계획' : '오늘은 계획 없는 날'}
          </T>
          {planned || done ? (
            <T variant="small" color={done ? theme.text : theme.textMuted}>
              {statusText(day)}
            </T>
          ) : null}
        </View>
        <T variant="title" style={{ fontSize: 24, lineHeight: 30 }}>
          {planned ? describePlan(planned) : '쉬거나, 하고 싶은 운동을'}
        </T>
      </View>

      {done ? (
        <View style={{ gap: space(2) }}>
          {day.sessions.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <KindDot kind={s.kind} />
              <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                {describeSession(s)}
              </T>
            </View>
          ))}
        </View>
      ) : null}

      <Button title={done ? '하나 더 기록하기' : '기록하기'} kind={kind} onPress={() => goRecord({ tab: 'log', date: day.date })} />
    </Card>
  );
};

interface SummaryProps {
  summary: ActivitySummary;
}

const CaloriesCard = ({ summary }: SummaryProps) => {
  const theme = useTheme();
  const { today_kcal: day, month_kcal: monthKcal } = summary;
  const ratio = (actual: number, target: number): number => (target > 0 ? actual / target : actual > 0 ? 1 : 0);
  const toDate = monthKcal.target_to_date > 0 ? Math.round((monthKcal.actual / monthKcal.target_to_date) * 100) : 0;

  return (
    <Card style={{ gap: space(4) }}>
      <SectionTitle
        title="소비 칼로리"
        caption={summary.weight_assumed ? '체중 기록이 없어 70kg 기준으로 추정했어요. 기록 › 신체에 체중을 넣어 주세요.' : undefined}
      />

      <View style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(1.5) }}>
          <T variant="label" style={{ width: 52 }}>
            오늘
          </T>
          <T variant="numXl">{formatNumber(day.actual)}</T>
          <T variant="label">{day.target > 0 ? `/ ${formatNumber(day.target)} kcal` : 'kcal'}</T>
        </View>
        <ProgressBar value={ratio(day.actual, day.target)} />
      </View>

      <View style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(1.5) }}>
          <T variant="label" style={{ width: 52 }}>
            {Number(summary.month.slice(5, 7))}월
          </T>
          <T variant="numMd">{formatNumber(monthKcal.actual)}</T>
          <T variant="label">/ {formatNumber(monthKcal.target)} kcal</T>
        </View>
        <ProgressBar
          value={ratio(monthKcal.actual, monthKcal.target)}
          marker={monthKcal.target > 0 ? monthKcal.target_to_date / monthKcal.target : undefined}
          color={theme.textMuted}
        />
        {monthKcal.target_to_date > 0 ? (
          <T variant="caption">
            세로선은 오늘까지 목표예요. 지금 목표의 <T variant="caption" color={theme.text} style={{ fontWeight: '700' }}>{toDate}%</T>
          </T>
        ) : null}
      </View>
    </Card>
  );
};

interface ChartCardProps extends SummaryProps {
  width: number;
}

const RunCard = ({ summary, width }: ChartCardProps) => {
  const theme = useTheme();
  const { run } = summary;
  const series = (kind: string) => summary.run_series.find((s) => s.kind === kind);
  const vdot = series('vdot');
  const pace = series('pace_sec');
  const weekly = series('weekly_km');
  const hasRuns = (weekly?.points.length ?? 0) > 0;
  const km = (v?: number): string => (v === undefined ? '-' : formatKm(v).replace('km', ''));

  return (
    <Card kind="run" style={{ gap: space(5) }}>
      <SectionTitle title="러닝" caption="최근 30일" right={<KindDot kind="run" size={12} />} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space(4), columnGap: space(3) }}>
        <Stat label="횟수" value={String(run.count)} unit="회" sub={`합계 ${formatKm(run.total_km)}`} />
        <Stat
          label="평균 거리"
          value={run.count ? km(run.avg_distance_km) : '-'}
          unit={run.count ? 'km' : undefined}
          sub={run.target_distance_km ? `목표 ${formatKm(run.target_distance_km)}` : undefined}
        />
        <Stat label="평균 페이스" value={formatPace(run.avg_pace_sec)} sub={run.target_pace_sec ? `목표 ${formatPace(run.target_pace_sec)}` : '/km'} />
        <Stat label="최고 페이스" value={formatPace(run.best_pace_sec)} sub="1km 이상" />
        <Stat label="러닝 능력" value={run.vdot ? run.vdot.toFixed(1) : '-'} sub="VDOT · 오를수록 빨라요" />
      </View>

      {hasRuns && width > 0 ? (
        <>
          {weekly ? <TrendChart series={weekly} label="주간 거리 (km)" unit="km" width={width} color={theme.run.solid} /> : null}
          {pace ? (
            <TrendChart
              series={pace}
              label="평균 페이스 · 낮을수록 빨라요"
              width={width}
              color={theme.run.solid}
              format={(v) => formatPace(v)}
              formatDelta={(d) => `${signed(d, 0)}초`}
              emptyText="시간을 함께 기록한 러닝이 없습니다."
            />
          ) : null}
          {vdot ? <TrendChart series={vdot} label="러닝 능력 (VDOT)" width={width} color={theme.run.solid} emptyText="거리와 시간을 함께 기록한 러닝이 없습니다." /> : null}
        </>
      ) : (
        <Message text="최근 6개월 러닝 기록이 없어요." />
      )}
    </Card>
  );
};

interface WeightCardProps {
  exercises: ExerciseStat[];
  active?: ExerciseStat;
  onSelect: (name: string) => void;
  width: number;
}

const WeightCard = ({ exercises, active, onSelect, width }: WeightCardProps) => {
  const theme = useTheme();
  const bodyweight = (e: ExerciseStat): boolean => e.top_weight_kg <= 0;
  const series = useMemo(() => {
    if (!active) return null;
    const values = active.series.map((p) => p.value);
    const first = values[0] ?? 0;
    const last = values[values.length - 1] ?? 0;
    return {
      points: active.series,
      stats: { first, last, min: Math.min(...values), max: Math.max(...values), delta: last - first },
    };
  }, [active]);

  return (
    <Card kind="weight" style={{ gap: space(4) }}>
      <SectionTitle title="웨이트" caption="종목별 최근 기록 · 추정 1RM. 누르면 변화가 보여요." right={<KindDot kind="weight" size={12} />} />
      {exercises.length === 0 ? (
        <Message text="최근 6개월 웨이트 기록이 없어요. 기록 탭에서 종목 · 무게 · 횟수를 남겨 보세요." />
      ) : (
        <View>
          {exercises.map((e, i) => {
            const selected = active?.name === e.name;
            return (
              <Pressable
                key={e.name}
                onPress={() => onSelect(e.name)}
                accessibilityState={{ selected }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space(3),
                  paddingVertical: space(3),
                  paddingHorizontal: space(3),
                  marginHorizontal: -space(3),
                  borderRadius: radius.box,
                  borderTopWidth: i === 0 || selected ? 0 : 1,
                  borderTopColor: theme.line,
                  backgroundColor: selected ? theme.weight.soft : 'transparent',
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T variant="bodyStrong" numberOfLines={1}>
                    {e.name}
                  </T>
                  <T variant="caption">
                    {formatShortDate(e.last_date)} · {bodyweight(e) ? `맨몸 ${e.top_reps}회` : `${e.top_weight_kg}kg × ${e.top_reps}회`} · {e.sets}세트
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <T variant="numMd" color={selected ? theme.weight.ink : theme.text}>
                      {bodyweight(e) ? e.top_reps : e.estimated_1rm}
                    </T>
                    <T variant="small">{bodyweight(e) ? '회' : 'kg'}</T>
                  </View>
                  <T variant="small" style={{ fontWeight: '500' }}>
                    {e.series.length > 1 ? `${signed(e.delta_1rm)}${bodyweight(e) ? '회' : 'kg'}` : '첫 기록'}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
      {active && series && width > 0 ? (
        <TrendChart
          series={series}
          label={bodyweight(active) ? `${active.name} · 최대 횟수` : `${active.name} · 추정 1RM (kg)`}
          unit={bodyweight(active) ? '회' : 'kg'}
          width={width}
          color={theme.weight.solid}
        />
      ) : null}
    </Card>
  );
};

export default Home;
