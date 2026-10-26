import React, { useEffect } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';

import { ActivityGrid, describeSession, statusText } from '@/components/ActivityGrid';
import { Heading, Message, Page, Screen, T } from '@/components/ui';
import * as api from '@/api/endpoints';
import { appleHealthSupported, syncAppleHealth } from '@/features/health/appleHealth';
import { useCalendar } from '@/features/calendar/useCalendar';
import { isBodyweight, signed, useSummary } from '@/features/stats/useSummary';
import { useAuth } from '@/hooks/useAuth';
import { addDays, formatKm, formatLongDate, formatNumber, formatPace, startOfWeek, todayString } from '@/lib/date';
import { alpha, kindColors, radius, space, useTheme } from '@/theme';
import type { ActivitySummary, CalendarDay, WorkoutKind } from '@/types';

const SYNC_INTERVAL = 10 * 60 * 1000;

// t 는 같은 탭 · 날짜로 다시 눌러도 기록 탭이 알아채게 붙인다
const goRecord = (params: Record<string, string>): void =>
  router.push({ pathname: '/record', params: { ...params, t: String(Date.now()) } });

// 홈은 "오늘 뭐 하지, 이번 주는 잘 하고 있나" 하나만 답한다.
// ① 오늘 할 운동 + 기록하기 ② 이번 주 한 줄 ③ 러닝 · 웨이트 · 칼로리 한 줄씩 — 그래프는 누르고 들어간 화면에서
const Home = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const today = todayString();
  const weekStart = startOfWeek(today);
  const { days, loading, error, reload } = useCalendar(weekStart, addDays(weekStart, 6));
  const { summary, error: summaryError, reload: reloadSummary } = useSummary();

  // 연결한 앱(Strava)에서 새 활동을 받아 온다. 서버가 10분에 한 번만 실제로 가져온다.
  // iPhone 앱은 Apple 건강에 새로 남은 운동도 10분에 한 번 보낸다
  useEffect(() => {
    const refresh = (): void => {
      void reload();
      void reloadSummary();
    };
    void api
      .runSync(false)
      .then(async ({ connections }) => {
        const fresh = connections.some(
          (c) => c.provider === 'strava' && c.last_synced_at && Date.now() - new Date(c.last_synced_at).getTime() < 60_000,
        );
        if (fresh) refresh();

        const apple = connections.find((c) => c.provider === 'apple_health');
        if (!appleHealthSupported || !apple) return;
        if (apple.last_synced_at && Date.now() - new Date(apple.last_synced_at).getTime() < SYNC_INTERVAL) return;
        const result = await syncAppleHealth(apple.last_synced_at);
        if (result && result.saved > 0) refresh();
      })
      .catch(() => undefined); // 동기화 실패는 내 정보의 연결 상태에 남는다
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayDay = days.find((d) => d.date === today);

  return (
    <Screen>
      <Page
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => {
              void reload();
              void reloadSummary();
            }}
            tintColor={theme.text}
          />
        }
      >
        <Heading overline={formatLongDate(today)} title={user?.display_name ? `${user.display_name}님, 오늘은` : '오늘은'} />

        <Message text={error || summaryError} tone="error" />

        {loading && !todayDay ? <ActivityIndicator color={theme.text} /> : null}
        {todayDay ? <TodayPoster day={todayDay} /> : null}
        {days.length > 0 ? <WeekCard days={days} today={today} noPlan={!!summary && !summary.current_plan_id} /> : null}
        {summary ? <Overview summary={summary} /> : null}
      </Page>
    </Screen>
  );
};

/** 이번 주: 7칸 잔디 + "계획 n일 중 m일". 날짜를 누르면 기록 › 캘린더 */
const WeekCard = ({ days, today, noPlan }: { days: CalendarDay[]; today: string; noPlan: boolean }) => {
  const theme = useTheme();
  const planned = days.filter((d) => d.planned && d.planned.kind !== 'rest').length;
  const done = days.filter((d) => d.sessions.length > 0).length;

  return (
    <View style={{ gap: space(3), paddingTop: space(2) }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space(2), paddingHorizontal: space(1) }}>
        <T variant="heading">이번 주</T>
        {planned > 0 ? (
          <T variant="label">
            계획 {planned}일 중{' '}
            <T variant="label" color={theme.text} style={{ fontWeight: '800' }}>
              {done}일
            </T>{' '}
            했어요
          </T>
        ) : (
          <T variant="label">{done > 0 ? `${done}일 운동했어요` : '아직 기록이 없어요'}</T>
        )}
      </View>
      <ActivityGrid mode="month" days={days} today={today} selected={today} onSelect={() => goRecord({ tab: 'calendar' })} />
      {noPlan ? <T variant="caption">운동 계획이 없어 칸이 비어 있어요. 기록 › 계획에서 요일별 루틴을 정해 보세요.</T> : null}
    </View>
  );
};

/** 러닝 · 웨이트 · 칼로리를 숫자 하나씩. 누르면 그래프가 있는 화면으로 */
const Overview = ({ summary }: { summary: ActivitySummary }) => {
  const { run, exercises, month_kcal: kcal } = summary;
  const month = Number(summary.month.slice(5, 7));
  // 웨이트는 6개월 동안 가장 많이 오른 종목 하나
  const top = [...exercises].sort((a, b) => b.delta_1rm - a.delta_1rm)[0];
  const toDate = kcal.target_to_date > 0 ? Math.round((kcal.actual / kcal.target_to_date) * 100) : undefined;

  return (
    <View style={{ gap: space(1), paddingTop: space(2) }}>
      <T variant="heading" style={{ paddingHorizontal: space(1) }}>
        내 기록
      </T>
      <View>
        <OverviewRow
          kind="run"
          title="러닝"
          value={run.count ? formatKm(run.total_km).replace('km', '') : undefined}
          unit="km"
          sub={run.count ? `최근 30일 ${run.count}회 · 평균 ${formatPace(run.avg_pace_sec)}` : '최근 30일 기록이 없어요'}
          href="/stats/run"
        />
        <OverviewRow
          kind="weight"
          title="웨이트"
          value={top ? String(isBodyweight(top) ? top.top_reps : top.estimated_1rm) : undefined}
          unit={top && isBodyweight(top) ? '회' : 'kg'}
          sub={
            top
              ? `${top.name} ${isBodyweight(top) ? '최대 횟수' : '1RM'}${top.series.length > 1 ? ` · 6개월 ${signed(top.delta_1rm)}` : ''}`
              : '최근 6개월 기록이 없어요'
          }
          href="/stats/weight"
          divider
        />
        <OverviewRow
          title="칼로리"
          value={toDate !== undefined ? String(toDate) : kcal.actual > 0 ? formatNumber(kcal.actual) : undefined}
          unit={toDate !== undefined ? '%' : 'kcal'}
          sub={toDate !== undefined ? `${month}월 목표를 오늘까지 이만큼 채웠어요` : `${month}월 소비 칼로리`}
          href="/stats/kcal"
          divider
        />
      </View>
    </View>
  );
};

interface OverviewRowProps {
  kind?: WorkoutKind;
  title: string;
  value?: string;
  unit: string;
  sub: string;
  href: '/stats/run' | '/stats/weight' | '/stats/kcal';
  divider?: boolean;
}

const OverviewRow = ({ kind, title, value, unit, sub, href, divider }: OverviewRowProps) => {
  const theme = useTheme();
  const ink = kind ? kindColors(theme, kind).ink : theme.text;
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={`${title} 자세히 보기`}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(3),
        paddingVertical: space(3.5),
        paddingHorizontal: space(1),
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: theme.dark ? theme.line : theme.fieldBorder + '55',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: kind ? kindColors(theme, kind).solid : theme.rest.solid }} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T variant="label">{title}</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
          <T variant="numLg" color={value ? ink : theme.textMuted}>
            {value ?? '-'}
          </T>
          {value ? <T variant="label">{unit}</T> : null}
        </View>
        <T variant="caption" numberOfLines={1}>
          {sub}
        </T>
      </View>
      <T variant="heading" color={theme.textMuted}>
        ›
      </T>
    </Pressable>
  );
};

const KIND_NAMES: Record<string, string> = { run: '러닝', weight: '웨이트', other: '운동', rest: '쉬는 날' };

/**
 * 오늘의 포스터: 홈에서 가장 먼저, 가장 크게 보이는 것.
 * 운동 종류의 색으로 꽉 채운 면 위에 종류 이름을 크게, 그 아래 오늘 할 것(종목 · 거리)과 기록하기 버튼.
 */
const TodayPoster = ({ day }: { day: CalendarDay }) => {
  const theme = useTheme();
  const planned = day.planned && day.planned.kind !== 'rest' ? day.planned : undefined;
  const kind = day.sessions[0]?.kind ?? planned?.kind;
  const done = day.sessions.length > 0;
  const colors = kindColors(theme, kind ?? 'rest');
  // 쉬는 날은 색 없이 옅은 면 · 본문색 글자
  const fill = kind ? colors.solid : theme.rest.soft;
  const ink = kind ? theme.onKind : theme.text;
  const inkSoft = kind ? alpha(theme.onKind, 0.82) : theme.textMuted;

  const lines: { name: string; detail: string }[] =
    planned?.kind === 'weight'
      ? (planned.exercises ?? []).map((e) => ({
          name: e.name,
          detail: `${e.sets}×${e.reps}${e.weight_kg ? ` · ${e.weight_kg}kg` : ''}`,
        }))
      : planned?.kind === 'run'
        ? [
            {
              name: '거리 · 페이스',
              detail: [planned.distance_km && formatKm(planned.distance_km), planned.pace_sec_per_km && `${formatPace(planned.pace_sec_per_km)}/km`]
                .filter(Boolean)
                .join(' · ') || '자유롭게',
            },
          ]
        : [];

  return (
    <View style={{ backgroundColor: fill, borderRadius: radius.card + 4, padding: space(5), gap: space(5) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <T variant="label" color={inkSoft}>
          {planned?.kind === 'weight' && planned.exercises?.length
            ? `${planned.exercises.length}종목 · ${planned.exercises.reduce((n, e) => n + e.sets, 0)}세트`
            : planned
              ? '오늘 계획'
              : '오늘은 계획이 없어요'}
        </T>
        {planned || done ? (
          <View style={{ borderRadius: radius.pill, paddingHorizontal: space(2.5), paddingVertical: 2, borderWidth: 1, borderColor: inkSoft }}>
            <T variant="small" color={ink}>
              {statusText(day)}
            </T>
          </View>
        ) : null}
      </View>

      <T color={ink} style={{ fontSize: 60, lineHeight: 64, fontWeight: '800', letterSpacing: -2 }}>
        {KIND_NAMES[kind ?? 'rest']}
      </T>

      {lines.length > 0 ? (
        <View style={{ gap: space(2) }}>
          {lines.map((l) => (
            <View key={l.name} style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(3) }}>
              <T variant="bodyStrong" color={ink} style={{ flex: 1, fontSize: 16 }} numberOfLines={1}>
                {l.name}
              </T>
              <T variant="numSm" color={ink}>
                {l.detail}
              </T>
            </View>
          ))}
        </View>
      ) : !planned && !done ? (
        <T variant="body" color={inkSoft}>
          쉬어도 좋고, 하고 싶은 운동을 해도 좋아요.
        </T>
      ) : null}

      {done ? (
        <View style={{ gap: space(1.5), borderTopWidth: 1, borderTopColor: alpha(kind ? theme.onKind : theme.text, 0.25), paddingTop: space(3) }}>
          <T variant="label" color={inkSoft}>
            한 운동
          </T>
          {day.sessions.map((s) => (
            <T key={s.id} variant="bodyStrong" color={ink} numberOfLines={1}>
              {describeSession(s)}
            </T>
          ))}
        </View>
      ) : null}

      <Pressable
        onPress={() => goRecord({ tab: 'log', date: day.date })}
        accessibilityRole="button"
        style={({ pressed }) => ({
          height: 54,
          borderRadius: radius.tile,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: kind ? theme.onKind : theme.text,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <T variant="bodyStrong" color={kind ? colors.solid : theme.bg} style={{ fontSize: 17, fontWeight: '800' }}>
          {done ? '하나 더 기록하기' : '기록하기'}
        </T>
      </Pressable>
    </View>
  );
};

export default Home;
