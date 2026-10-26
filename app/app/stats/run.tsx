import React, { useState } from 'react';
import { View } from 'react-native';

import { TrendChart } from '@/components/TrendChart';
import { Card, Message, Segmented, Stat, T } from '@/components/ui';
import { signed, useSummary } from '@/features/stats/useSummary';
import { StatsPage } from '@/features/stats/StatsPage';
import { formatKm, formatPace } from '@/lib/date';
import { space, useTheme } from '@/theme';

type View_ = 'weekly_km' | 'pace_sec' | 'vdot';

const VIEWS: { value: View_; label: string }[] = [
  { value: 'weekly_km', label: '주간 거리' },
  { value: 'pace_sec', label: '페이스' },
  { value: 'vdot', label: '러닝 능력' },
];

// 그래프마다 무엇을 보면 되는지 한 줄
const READS: Record<View_, string> = {
  weekly_km: '한 주에 달린 거리예요. 꾸준히 오르면 체력이 붙고 있어요.',
  pace_sec: '1km 평균 페이스예요. 아래로 내려갈수록 빨라진 거예요.',
  vdot: '거리와 시간으로 잰 러닝 능력(VDOT)이에요. 오를수록 같은 거리를 더 빨리 달려요.',
};

/** 러닝: 최근 30일 숫자 셋 + 그래프 하나 (주간 거리 · 페이스 · 러닝 능력 중 고른 것) */
const Run = () => {
  const theme = useTheme();
  const { summary, error } = useSummary();
  const [view, setView] = useState<View_>('weekly_km');
  const [width, setWidth] = useState<number>(0);

  const run = summary?.run;
  const series = summary?.run_series.find((s) => s.kind === view);
  const hasRuns = (summary?.run_series.find((s) => s.kind === 'weekly_km')?.points.length ?? 0) > 0;

  return (
    <StatsPage title="러닝" caption="최근 30일" loading={!summary && !error} error={error}>
      {run ? (
        <>
          <Card kind="run" style={{ gap: space(4) }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(1.5) }}>
              <T variant="numXl" color={theme.run.ink}>
                {formatKm(run.total_km).replace('km', '')}
              </T>
              <T variant="label">km · {run.count}회</T>
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space(4), columnGap: space(3) }}>
              <Stat
                label="평균 거리"
                value={run.count ? formatKm(run.avg_distance_km).replace('km', '') : '-'}
                unit={run.count ? 'km' : undefined}
                sub={run.target_distance_km ? `목표 ${formatKm(run.target_distance_km)}` : undefined}
              />
              <Stat label="평균 페이스" value={formatPace(run.avg_pace_sec)} sub={run.target_pace_sec ? `목표 ${formatPace(run.target_pace_sec)}` : '/km'} />
              <Stat label="최고 페이스" value={formatPace(run.best_pace_sec)} sub="1km 이상" />
            </View>
          </Card>

          {hasRuns ? (
            <Card style={{ gap: space(4) }}>
              <Segmented options={VIEWS} value={view} onChange={setView} />
              <T variant="caption">{READS[view]}</T>
              <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
                {series && width > 0 ? (
                  view === 'pace_sec' ? (
                    <TrendChart
                      series={series}
                      label="최근 6개월"
                      width={width}
                      color={theme.run.solid}
                      format={(v) => formatPace(v)}
                      formatDelta={(d) => `${signed(d, 0)}초`}
                      emptyText="시간을 함께 기록한 러닝이 없어요."
                    />
                  ) : (
                    <TrendChart
                      series={series}
                      label="최근 6개월"
                      unit={view === 'weekly_km' ? 'km' : ''}
                      width={width}
                      color={theme.run.solid}
                      emptyText="거리와 시간을 함께 기록한 러닝이 없어요."
                    />
                  )
                ) : null}
              </View>
            </Card>
          ) : (
            <Message text="최근 6개월 러닝 기록이 없어요. 기록 탭에서 거리와 시간을 남기면 그래프가 생겨요." />
          )}
        </>
      ) : null}
    </StatsPage>
  );
};

export default Run;
