import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { ActivityGrid, ActivityLegend, STATUS_LABELS, describePlan, describeSession } from '@/components/ActivityGrid';
import { TrendChart } from '@/components/TrendChart';
import { Heading, Message, ProgressBar, Screen, SectionTitle, Segmented, Stat, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import {
  addDays,
  addMonths,
  endOfMonth,
  formatKm,
  formatLongDate,
  formatMonth,
  formatNumber,
  formatPace,
  formatShortDate,
  monthOf,
  startOfMonth,
  startOfWeek,
  todayString,
} from '@/lib/date';
import { space, tracking, useTheme } from '@/theme';
import { KIND_LABELS, SOURCE_LABELS, type ActivitySummary, type CalendarDay, type ExerciseStat } from '@/types';

type Mode = 'week' | 'month';

const MODES: { value: Mode; label: string }[] = [
  { value: 'week', label: '주' },
  { value: 'month', label: '월' },
];

const visibleRange = (mode: Mode, anchor: string): { from: string; to: string } => {
  if (mode === 'week') {
    const from = startOfWeek(anchor);
    return { from, to: addDays(from, 6) };
  }
  // 달력은 월요일부터 일요일까지 꽉 찬 주로 보여 준다
  const month = monthOf(anchor);
  return { from: startOfWeek(startOfMonth(month)), to: addDays(startOfWeek(endOfMonth(month)), 6) };
};

const signed = (n: number, digits = 1): string => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(digits)}`;

// 메인: ① 운동 체크(계획 대비 수행 잔디) ② 운동 기록 세부(칼로리 · 러닝 · 웨이트 수행 능력)
const Home = () => {
  const theme = useTheme();
  const today = todayString();

  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState<string>(today);
  const [selected, setSelected] = useState<string>(today);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [exercise, setExercise] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [width, setWidth] = useState<number>(0);

  const { from, to } = visibleRange(mode, anchor);
  const month = monthOf(anchor);

  const loadCalendar = useCallback(async (): Promise<void> => {
    try {
      setDays((await api.fetchCalendar(from, to)).items);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '운동 기록을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  const loadSummary = useCallback(async (): Promise<void> => {
    try {
      setSummary(await api.fetchActivitySummary(month));
    } catch (err) {
      setError(err instanceof Error ? err.message : '통계를 불러오지 못했습니다.');
    }
  }, [month]);

  // 다른 탭에서 기록 · 계획을 바꾸고 돌아오면 다시 읽는다
  useFocusEffect(
    useCallback(() => {
      void loadCalendar();
    }, [loadCalendar]),
  );
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
          void loadCalendar();
          void loadSummary();
        }
      })
      .catch(() => undefined); // 동기화 실패는 PROFILE 의 연결 상태에 남는다
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const move = (step: number): void => {
    const next = mode === 'month' ? startOfMonth(addMonths(month, step)) : addDays(anchor, step * 7);
    setAnchor(next);
    const range = visibleRange(mode, next);
    if (selected < range.from || selected > range.to) setSelected(mode === 'month' ? next : range.from);
  };

  const goToday = (): void => {
    setAnchor(today);
    setSelected(today);
  };

  const selectedDay = days.find((d) => d.date === selected);
  const rangeLabel = mode === 'month' ? formatMonth(month) : `${formatShortDate(from)} – ${formatShortDate(to)}`;

  const exercises = summary?.exercises ?? [];
  const activeExercise = exercises.find((e) => e.name === exercise) ?? exercises[0];

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
                void loadCalendar();
                void loadSummary();
              }}
              tintColor={theme.text}
            />
          }
        >
          <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
            <Heading eyebrow="Home · Workout Check" title="운동 체크" caption="계획한 날에 운동했는지 잔디로 보여 줍니다. 칸을 누르면 그날 기록이 보입니다." />
          </View>

          <Message text={error} tone="error" />

          {/* ① 운동 체크 */}
          <View style={{ gap: space(3) }}>
            <Segmented options={MODES} value={mode} onChange={setMode} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pressable onPress={() => move(-1)} hitSlop={10} accessibilityLabel="이전">
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', paddingHorizontal: space(2) }}>‹</Text>
              </Pressable>
              <Pressable onPress={goToday} accessibilityLabel="오늘로">
                <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', letterSpacing: tracking.tight }}>{rangeLabel}</Text>
              </Pressable>
              <Pressable onPress={() => move(1)} hitSlop={10} accessibilityLabel="다음">
                <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', paddingHorizontal: space(2) }}>›</Text>
              </Pressable>
            </View>

            <ActivityGrid mode={mode} days={days} month={month} today={today} selected={selected} onSelect={setSelected} />
            <ActivityLegend />

            {summary && summary.planned_days > 0 ? (
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: '700' }}>
                {formatMonth(summary.month)} 계획 {summary.planned_days}일 중 {summary.done_days}일 완료 (오늘까지)
              </Text>
            ) : null}
            {summary && !summary.current_plan_id ? (
              <Message text="아직 운동 계획이 없습니다. RECORD › 계획에서 요일별 루틴을 정하면 잔디가 계획 기준으로 채워집니다." />
            ) : null}
          </View>

          {selectedDay ? <DayDetail day={selectedDay} /> : null}

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

interface DayDetailProps {
  day: CalendarDay;
}

const DayDetail = ({ day }: DayDetailProps) => {
  const theme = useTheme();
  const status = day.status === 'partial' ? `일부 ${Math.round(day.achievement * 100)}%` : STATUS_LABELS[day.status];

  return (
    <View style={{ gap: space(3) }}>
      <SectionTitle
        title={formatLongDate(day.date)}
        right={<Text style={{ color: theme.text, fontSize: 12, fontWeight: '800' }}>{status}</Text>}
      />
      <Text style={{ color: theme.textMuted, fontSize: 13 }}>계획 · {describePlan(day.planned)}</Text>
      {day.sessions.length === 0 ? (
        <Text style={{ color: theme.textMuted, fontSize: 13 }}>기록 없음</Text>
      ) : (
        day.sessions.map((s) => (
          <View key={s.id} style={{ flexDirection: 'row', gap: space(2), alignItems: 'baseline' }}>
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800', width: 44 }}>{KIND_LABELS[s.kind]}</Text>
            <Text style={{ color: theme.text, fontSize: 13, flex: 1 }}>{describeSession(s)}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 11 }}>{SOURCE_LABELS[s.source]}</Text>
          </View>
        ))
      )}
      <View style={{ flexDirection: 'row', gap: space(4) }}>
        <TextButton
          title="+ 이날 기록하기"
          onPress={() => router.push({ pathname: '/record', params: { tab: 'log', date: day.date } })}
        />
        {!day.planned ? (
          <TextButton title="계획 세우기" tone="muted" onPress={() => router.push({ pathname: '/record', params: { tab: 'plan' } })} />
        ) : null}
      </View>
    </View>
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
