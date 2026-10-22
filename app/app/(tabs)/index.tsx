import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ActivityGrid, ActivityLegend } from '@/components/ActivityGrid';
import { TrendChart } from '@/components/TrendChart';
import { Heading, Message, ProgressBar, Screen, SectionTitle, Stat, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { DayDetail } from '@/features/calendar/DayDetail';
import { useCalendar } from '@/features/calendar/useCalendar';
import { addDays, formatKm, formatMonth, formatNumber, formatPace, formatShortDate, monthOf, startOfWeek, todayString } from '@/lib/date';
import { space, tracking, useTheme } from '@/theme';
import type { ActivitySummary, ExerciseStat } from '@/types';

const signed = (n: number, digits = 1): string => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

// t 는 같은 탭 · 날짜로 다시 눌러도 RECORD 가 알아채게 붙인다
const goRecord = (params: Record<string, string>): void =>
  router.push({ pathname: '/record', params: { ...params, t: String(Date.now()) } });

// 메인: ① 운동 체크(이번 주 잔디 한 줄 — 더보기는 RECORD › 캘린더) ② 운동 기록 세부(칼로리 · 러닝 · 웨이트 수행 능력)
const Home = () => {
  const theme = useTheme();
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
      .catch(() => undefined); // 동기화 실패는 PROFILE 의 연결 상태에 남는다
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const moveWeek = (step: number): void => {
    const next = addDays(weekStart, step * 7);
    setWeekStart(next);
    setSelected(next <= today && today <= addDays(next, 6) ? today : next);
  };

  const selectedDay = days.find((d) => d.date === selected);
  const exercises = summary?.exercises ?? [];
  const activeExercise = exercises.find((e) => e.name === exercise) ?? exercises[0];
  const isThisWeek = weekStart === startOfWeek(today);

  return (
    <Screen>
      {loading ? (
        <ActivityIndicator color={theme.text} />
      ) : (
        <ScrollView
          contentContainerStyle={{ gap: space(5), paddingBottom: space(8), width: '100%', maxWidth: 720, alignSelf: 'center' }}
          showsVerticalScrollIndicator={false}
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
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            <Heading eyebrow="Home · Workout Check" title="운동 체크" caption="이번 주 계획대로 운동했는지 보여 줍니다. 칸을 누르면 그날 기록이 보입니다." />
          </View>

          <Message text={error || summaryError} tone="error" />

          {/* ① 운동 체크: 달력의 한 줄(1주) */}
          <View style={{ gap: space(3) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <Pressable onPress={() => moveWeek(-1)} hitSlop={10} accessibilityLabel="지난주">
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', paddingHorizontal: space(1) }}>‹</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setWeekStart(startOfWeek(today));
                  setSelected(today);
                }}
                accessibilityLabel="이번 주로"
              >
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: '800', letterSpacing: tracking.tight }}>
                  {isThisWeek ? '이번 주' : formatMonth(monthOf(weekStart))} · {formatShortDate(weekStart)} – {formatShortDate(weekEnd)}
                </Text>
              </Pressable>
              <Pressable onPress={() => moveWeek(1)} hitSlop={10} accessibilityLabel="다음 주">
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', paddingHorizontal: space(1) }}>›</Text>
              </Pressable>
              <View style={{ flex: 1 }} />
              <TextButton title="더보기 ›" onPress={() => goRecord({ tab: 'calendar' })} />
            </View>

            <ActivityGrid mode="month" days={days} today={today} selected={selected} onSelect={setSelected} />
            <ActivityLegend />

            {summary && summary.planned_days > 0 ? (
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                {formatMonth(summary.month)} 계획 {summary.planned_days}일 중 {summary.done_days}일 완료 (오늘까지)
              </Text>
            ) : null}
            {summary && !summary.current_plan_id ? (
              <Message text="아직 운동 계획이 없습니다. RECORD › 운동 계획에서 요일별 루틴을 정하면 잔디가 계획 기준으로 채워집니다." />
            ) : null}
          </View>

          {selectedDay ? (
            <DayDetail day={selectedDay} onRecord={(date) => goRecord({ tab: 'log', date })} onPlan={() => goRecord({ tab: 'plan' })} />
          ) : null}

          {/* ② 운동 기록 세부 */}
          {summary ? (
            <>
              <CaloriesSection summary={summary} />
              <RunSection summary={summary} width={width} />
              <WeightSection exercises={exercises} active={activeExercise} onSelect={setExercise} width={width} />
            </>
          ) : null}
        </ScrollView>
      )}
    </Screen>
  );
};

interface SummaryProps {
  summary: ActivitySummary;
}

const CaloriesSection = ({ summary }: SummaryProps) => {
  const theme = useTheme();
  const { today_kcal: day, month_kcal: monthKcal } = summary;
  const ratio = (actual: number, target: number): number => (target > 0 ? actual / target : actual > 0 ? 1 : 0);

  return (
    <View style={{ gap: space(4) }}>
      <SectionTitle
        title="Calories"
        caption={
          summary.weight_assumed
            ? '체중 기록이 없어 70kg 기준으로 추정했습니다. RECORD › 신체에 체중을 넣으면 더 정확해집니다.'
            : `기기가 준 값이 없으면 체중 ${summary.body_weight_kg}kg 기준으로 추정합니다.`
        }
      />

      <View style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>오늘</Text>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {formatNumber(day.actual)}
            <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '600' }}>
              {day.target > 0 ? ` / ${formatNumber(day.target)} kcal` : ' kcal · 계획 없는 날'}
            </Text>
          </Text>
        </View>
        <ProgressBar value={ratio(day.actual, day.target)} />
      </View>

      <View style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontWeight: '700' }}>{formatMonth(summary.month)}</Text>
          <Text style={{ color: theme.text, fontSize: 22, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
            {formatNumber(monthKcal.actual)}
            <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: '600' }}> / {formatNumber(monthKcal.target)} kcal</Text>
          </Text>
        </View>
        <ProgressBar
          value={ratio(monthKcal.actual, monthKcal.target)}
          marker={monthKcal.target > 0 ? monthKcal.target_to_date / monthKcal.target : undefined}
        />
        {monthKcal.target_to_date > 0 ? (
          <Text style={{ color: theme.textMuted, fontSize: 11 }}>
            오늘까지 목표 {formatNumber(monthKcal.target_to_date)} kcal 대비{' '}
            {Math.round((monthKcal.actual / monthKcal.target_to_date) * 100)}% (세로선이 오늘까지 목표)
          </Text>
        ) : null}
      </View>
    </View>
  );
};

interface ChartSectionProps extends SummaryProps {
  width: number;
}

const RunSection = ({ summary, width }: ChartSectionProps) => {
  const { run } = summary;
  const series = (kind: string) => summary.run_series.find((s) => s.kind === kind);
  const vdot = series('vdot');
  const pace = series('pace_sec');
  const weekly = series('weekly_km');
  const hasRuns = (weekly?.points.length ?? 0) > 0;

  return (
    <View style={{ gap: space(4) }}>
      <SectionTitle title="Running" caption="최근 30일 기준. 러닝 능력 지수(VDOT)는 거리 · 시간으로 추정한 유산소 능력으로, 오를수록 같은 거리를 더 빨리 달립니다." />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space(4), columnGap: space(3) }}>
        <Stat label="러닝" value={`${run.count}회`} sub={`합계 ${formatKm(run.total_km)}`} />
        <Stat
          label="평균 거리"
          value={run.count ? formatKm(run.avg_distance_km) : '-'}
          sub={run.target_distance_km ? `목표 ${formatKm(run.target_distance_km)}` : undefined}
        />
        <Stat
          label="평균 페이스"
          value={formatPace(run.avg_pace_sec)}
          sub={run.target_pace_sec ? `목표 ${formatPace(run.target_pace_sec)}` : undefined}
        />
        <Stat label="최고 페이스" value={formatPace(run.best_pace_sec)} sub="1km 이상" />
        <Stat label="러닝 능력" value={run.vdot ? run.vdot.toFixed(1) : '-'} sub="VDOT" />
      </View>

      {hasRuns && width > 0 ? (
        <>
          {vdot ? <TrendChart series={vdot} label="러닝 능력 지수 (VDOT)" width={width} emptyText="거리와 시간을 함께 기록한 러닝이 없습니다." /> : null}
          {pace ? (
            <TrendChart
              series={pace}
              label="평균 페이스 (낮을수록 빠름)"
              width={width}
              format={(v) => formatPace(v)}
              formatDelta={(d) => `${signed(d, 0)}초`}
              emptyText="시간을 함께 기록한 러닝이 없습니다."
            />
          ) : null}
          {weekly ? <TrendChart series={weekly} label="주간 러닝 거리 (km)" unit="km" width={width} /> : null}
        </>
      ) : (
        <Message text="최근 6개월 러닝 기록이 없습니다." />
      )}
    </View>
  );
};

interface WeightSectionProps {
  exercises: ExerciseStat[];
  active?: ExerciseStat;
  onSelect: (name: string) => void;
  width: number;
}

const WeightSection = ({ exercises, active, onSelect, width }: WeightSectionProps) => {
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
    <View style={{ gap: space(3) }}>
      <SectionTitle title="Weights" caption="종목별 가장 최근 기록. 추정 1RM 은 Epley 공식(중량 × (1 + 횟수/30))으로 계산합니다. 종목을 누르면 변화가 보입니다." />
      {exercises.length === 0 ? (
        <Message text="최근 6개월 웨이트 세트 기록이 없습니다. RECORD › 수행 기록에서 종목 · 중량 · 횟수를 남겨 보세요." />
      ) : (
        exercises.map((e) => {
          const selected = active?.name === e.name;
          return (
            <Pressable
              key={e.name}
              onPress={() => onSelect(e.name)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space(3),
                paddingVertical: space(2.5),
                paddingHorizontal: space(1),
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
                backgroundColor: selected ? theme.grid : 'transparent',
              }}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: '800' }} numberOfLines={1}>
                  {e.name}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11 }}>
                  {formatShortDate(e.last_date)} ·{' '}
                  {bodyweight(e) ? `맨몸 최대 ${e.top_reps}회` : `${e.top_weight_kg}kg × ${e.top_reps}`} · {e.sets}세트
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', fontVariant: ['tabular-nums'] }}>
                  {bodyweight(e) ? `${e.top_reps}회` : `${e.estimated_1rm}kg`}
                </Text>
                <Text style={{ color: theme.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] }}>
                  {e.series.length > 1 ? `${signed(e.delta_1rm)}${bodyweight(e) ? '회' : 'kg'}` : '첫 기록'}
                </Text>
              </View>
            </Pressable>
          );
        })
      )}
      {active && series && width > 0 ? (
        <TrendChart
          series={series}
          label={bodyweight(active) ? `${active.name} · 최대 횟수` : `${active.name} · 추정 1RM (kg)`}
          unit={bodyweight(active) ? '회' : 'kg'}
          width={width}
        />
      ) : null}
    </View>
  );
};

export default Home;
