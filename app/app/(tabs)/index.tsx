import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, View } from 'react-native';
import { router } from 'expo-router';

import { ActivityGrid, describeSession } from '@/components/ActivityGrid';
import { KindMark } from '@/components/KindMark';
import { Button, Group, Heading, Message, Page, Row, Screen, Section, T, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { appleHealthSupported, syncAppleHealth } from '@/features/health/appleHealth';
import { useCalendar } from '@/features/calendar/useCalendar';
import { sessionFromPlan } from '@/features/record/quickLog';
import { isBodyweight, signed, useSummary } from '@/features/stats/useSummary';
import { useAuth } from '@/hooks/useAuth';
import { addDays, formatKm, formatLongDate, formatNumber, formatPace, startOfWeek, todayString } from '@/lib/date';
import { alpha, space, useTheme } from '@/theme';
import type { ActivitySummary, CalendarDay, PlanDay, Session } from '@/types';

const SYNC_INTERVAL = 10 * 60 * 1000;

const KIND_TITLE: Record<string, string> = { run: '러닝', weight: '웨이트', other: '운동' };

// 오늘: "오늘 뭐 하지, 이번 주는 잘 하고 있나" 하나만 답한다.
// ① 오늘 계획 (반전 면 — 이 화면 유일) + 계획대로 완료 ② 이번 주 7칸 ③ 러닝 · 웨이트 · 칼로리 한 줄씩
const Today = () => {
  const theme = useTheme();
  const { user } = useAuth();
  const today = todayString();
  const weekStart = startOfWeek(today);
  const { days, loading, error, reload } = useCalendar(weekStart, addDays(weekStart, 6));
  const { summary, error: summaryError, reload: reloadSummary } = useSummary();

  const refresh = (): void => {
    void reload();
    void reloadSummary();
  };

  // iPhone 앱이면 Apple 건강에 새로 남은 운동을 10분에 한 번 보낸다
  useEffect(() => {
    if (!appleHealthSupported) return;
    void api
      .fetchSync()
      .then(async ({ connections }) => {
        const apple = connections.find((c) => c.provider === 'apple_health');
        if (!apple) return;
        if (apple.last_synced_at && Date.now() - new Date(apple.last_synced_at).getTime() < SYNC_INTERVAL) return;
        const result = await syncAppleHealth(apple.last_synced_at);
        if (result && result.saved > 0) refresh();
      })
      .catch(() => undefined); // 실패는 나 › Apple 건강의 연결 상태에 남는다
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const todayDay = days.find((d) => d.date === today);
  const planned = todayDay?.planned && todayDay.planned.kind !== 'rest' ? todayDay.planned : undefined;
  const done = (todayDay?.sessions.length ?? 0) > 0;
  const title = done ? '오늘은 운동했어요' : planned ? `오늘은 ${KIND_TITLE[planned.kind]}` : '오늘은 쉬는 날';

  return (
    <Screen>
      <Page refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={theme.ink} />}>
        <Heading overline={`${formatLongDate(today)}${user?.display_name ? ` · ${user.display_name}` : ''}`} title={title} />
        <Message text={error || summaryError} tone="error" />

        {loading && !todayDay ? <ActivityIndicator color={theme.ink} /> : null}
        {todayDay ? <TodayCard day={todayDay} planned={planned} onSaved={refresh} /> : null}

        {days.length > 0 ? <ThisWeek days={days} today={today} noPlan={!!summary && !summary.current_plan_id} /> : null}
        {summary ? <Overview summary={summary} /> : null}
      </Page>
    </Screen>
  );
};

interface TodayCardProps {
  day: CalendarDay;
  planned?: PlanDay;
  onSaved: () => void;
}

/** 오늘의 계획 · 한 운동. 계획이 있으면 검은 면 위에 크게, "계획대로 완료" 한 번으로 기록된다 */
const TodayCard = ({ day, planned, onSaved }: TodayCardProps) => {
  const theme = useTheme();
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  // 방금 "계획대로 완료"로 저장한 기록. 잔디를 다시 받기 전에도 버튼이 다시 눌리지 않게 바로 기억한다 (두 번 저장 방지)
  const [saved, setSaved] = useState<Session | null>(null);
  const done = day.sessions.length > 0;
  const quick = done || saved ? undefined : sessionFromPlan(day.date, planned);
  // 다시 받은 잔디에 기록이 들어오면 잔디 쪽을 믿는다 (나중에 그 기록을 지우면 다시 "계획대로 완료"가 보인다)
  useEffect(() => {
    if (done) setSaved(null);
  }, [done]);
  const onInkSoft = alpha(theme.onInk, 0.72);

  const complete = async (): Promise<void> => {
    if (!quick) return;
    setBusy(true);
    setError('');
    try {
      setSaved(await api.createSession(quick));
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '기록하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  // 계획도 기록도 없는 날: 검은 면 없이 버튼 하나
  if (!planned && !done) {
    return (
      <View style={{ gap: space(3) }}>
        <T variant="body" color={theme.muted}>
          쉬어도 좋고, 하고 싶은 운동을 해도 좋아요.
        </T>
        <Button title="오늘 한 운동 기록하기" variant="secondary" onPress={() => router.push({ pathname: '/log', params: { date: day.date } })} />
      </View>
    );
  }

  return (
    <Group inverse style={{ gap: space(5) }}>
      {done ? (
        <View style={{ gap: space(3) }}>
          <T variant="label" color={onInkSoft}>
            한 운동
          </T>
          {day.sessions.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push({ pathname: '/log', params: { id: s.id, date: s.performed_on } })}
              accessibilityRole="button"
              accessibilityLabel={`${describeSession(s)} 고치기`}
              style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(3), opacity: pressed ? 0.6 : 1 })}
            >
              <KindMark kind={s.kind} size={10} color={theme.onInk} />
              <T variant="heading" color={theme.onInk} style={{ flex: 1 }} numberOfLines={2}>
                {describeSession(s)}
              </T>
              <T variant="small" color={onInkSoft}>
                고치기
              </T>
            </Pressable>
          ))}
          {planned ? (
            <T variant="caption" color={onInkSoft}>
              계획 {planned.kind === 'run' ? `러닝 ${planned.distance_km ? formatKm(planned.distance_km) : ''}` : `웨이트 ${planned.exercises?.length ?? 0}종목`}
            </T>
          ) : null}
        </View>
      ) : planned ? (
        <PlanFace planned={planned} />
      ) : null}

      {saved && !done ? (
        <Pressable
          onPress={() => router.push({ pathname: '/log', params: { id: saved.id, date: saved.performed_on } })}
          accessibilityRole="button"
          accessibilityLabel="방금 기록 고치기"
          style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
        >
          <T variant="bodyStrong" color={theme.onInk}>
            기록했어요.{' '}
            <T variant="bodyStrong" color={theme.onInk} style={{ textDecorationLine: 'underline' }}>
              고치기
            </T>
          </T>
        </Pressable>
      ) : null}

      <Message text={error} tone="error" />

      <View style={{ gap: space(2) }}>
        {quick ? (
          <Button title={busy ? '기록하는 중…' : '계획대로 완료'} variant="inverse" onPress={() => void complete()} disabled={busy} />
        ) : (
          <Button
            title={done || saved ? '하나 더 기록하기' : '기록하기'}
            variant="inverse"
            onPress={() => router.push({ pathname: '/log', params: { date: day.date } })}
          />
        )}
        {quick ? (
          <TextButton title="직접 입력하기" color={theme.onInk} onPress={() => router.push({ pathname: '/log', params: { date: day.date } })} />
        ) : null}
      </View>
    </Group>
  );
};

/** 검은 면 위 오늘 계획: 러닝은 거리를 크게, 웨이트는 종목 줄 */
const PlanFace = ({ planned }: { planned: PlanDay }) => {
  const theme = useTheme();
  const onInkSoft = alpha(theme.onInk, 0.72);
  if (planned.kind === 'run') {
    return (
      <View style={{ gap: space(2) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <KindMark kind="run" size={9} color={onInkSoft} />
          <T variant="label" color={onInkSoft}>
            오늘 계획
          </T>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2), flexWrap: 'wrap' }}>
          <T variant="numHero" color={theme.onInk}>
            {planned.distance_km ? Number(planned.distance_km.toFixed(2)) : '자유'}
          </T>
          {planned.distance_km ? (
            <T variant="heading" color={theme.onInk}>
              km
            </T>
          ) : null}
        </View>
        {planned.pace_sec_per_km ? (
          <T variant="numMd" color={onInkSoft}>
            목표 {formatPace(planned.pace_sec_per_km)} /km
          </T>
        ) : null}
      </View>
    );
  }
  const exercises = planned.exercises ?? [];
  const sets = exercises.reduce((n, e) => n + e.sets, 0);
  return (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <KindMark kind="weight" size={9} color={onInkSoft} />
        <T variant="label" color={onInkSoft}>
          오늘 계획 · {new Set(exercises.map((e) => e.name)).size}종목 {sets}세트
        </T>
      </View>
      {exercises.length === 0 ? (
        <T variant="heading" color={theme.onInk}>
          웨이트
        </T>
      ) : (
        exercises.map((e, i) => (
          <View key={`${e.name}-${i}`} style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(3) }}>
            <T variant="heading" color={theme.onInk} style={{ flex: 1 }} numberOfLines={1}>
              {e.name}
            </T>
            <T variant="numMd" color={theme.onInk}>
              {e.weight_kg ? `${e.weight_kg}kg ` : ''}
              {e.reps}회 × {e.sets}
            </T>
          </View>
        ))
      )}
    </View>
  );
};

/** 이번 주 7칸 + "계획 n일 중 m일". 칸을 누르면 캘린더 */
const ThisWeek = ({ days, today, noPlan }: { days: CalendarDay[]; today: string; noPlan: boolean }) => {
  const theme = useTheme();
  const planned = days.filter((d) => d.planned && d.planned.kind !== 'rest').length;
  const done = days.filter((d) => d.sessions.length > 0).length;
  return (
    <Section
      title="이번 주"
      right={
        <T variant="label">
          {planned > 0 ? (
            <>
              계획 {planned}일 중{' '}
              <T variant="label" color={theme.ink} style={{ fontWeight: '800' }}>
                {done}일
              </T>
            </>
          ) : done > 0 ? (
            `${done}일 운동`
          ) : (
            '아직 기록 없음'
          )}
        </T>
      }
    >
      <ActivityGrid mode="strip" days={days} today={today} onSelect={(date) => router.push({ pathname: '/calendar', params: { date } })} />
      {noPlan ? (
        <Pressable onPress={() => router.push('/plan')} accessibilityRole="button" style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <T variant="caption">
            주간 계획이 없어 칸이 비어 있어요.{' '}
            <T variant="caption" color={theme.ink} style={{ textDecorationLine: 'underline', fontWeight: '600' }}>
              계획 세우기
            </T>
          </T>
        </Pressable>
      ) : null}
    </Section>
  );
};

/** 러닝 · 웨이트 · 칼로리를 숫자 하나씩. 누르면 그래프가 있는 화면으로 */
const Overview = ({ summary }: { summary: ActivitySummary }) => {
  const { run, exercises, month_kcal: kcal } = summary;
  const month = Number(summary.month.slice(5, 7));
  const top = [...exercises].sort((a, b) => b.delta_1rm - a.delta_1rm)[0];
  const toDate = kcal.target_to_date > 0 ? Math.round((kcal.actual / kcal.target_to_date) * 100) : undefined;

  const value = (n: string | undefined, unit: string) => (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
      <T variant="numLg">{n ?? '-'}</T>
      {n ? <T variant="small">{unit}</T> : null}
    </View>
  );

  return (
    <Section title="내 기록">
      <Group flush>
        <Row
          first
          left={<KindMark kind="run" size={9} />}
          title="러닝"
          meta={run.count ? `최근 30일 ${run.count}회 · 평균 ${formatPace(run.avg_pace_sec)}` : '최근 30일 기록이 없어요'}
          value={value(run.count ? formatKm(run.total_km).replace('km', '') : undefined, 'km')}
          onPress={() => router.push('/stats/run')}
          accessibilityLabel="러닝 자세히 보기"
        />
        <Row
          left={<KindMark kind="weight" size={9} />}
          title="웨이트"
          meta={
            top
              ? `${top.name} ${isBodyweight(top) ? '최대 횟수' : '1RM'}${top.series.length > 1 ? ` · 6개월 ${signed(top.delta_1rm)}` : ''}`
              : '최근 6개월 기록이 없어요'
          }
          value={value(top ? String(isBodyweight(top) ? top.top_reps : top.estimated_1rm) : undefined, top && isBodyweight(top) ? '회' : 'kg')}
          onPress={() => router.push('/stats/weight')}
          accessibilityLabel="웨이트 자세히 보기"
        />
        <Row
          title="칼로리"
          meta={toDate !== undefined ? `${month}월 목표를 오늘까지 이만큼 채웠어요` : `${month}월 소비 칼로리`}
          value={value(toDate !== undefined ? String(toDate) : kcal.actual > 0 ? formatNumber(kcal.actual) : undefined, toDate !== undefined ? '%' : 'kcal')}
          onPress={() => router.push('/stats/kcal')}
          accessibilityLabel="칼로리 자세히 보기"
        />
      </Group>
    </Section>
  );
};

export default Today;
