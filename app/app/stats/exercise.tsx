import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { TrendChart } from '@/components/TrendChart';
import { Card, Message, T } from '@/components/ui';
import { isBodyweight, signed, useSummary } from '@/features/stats/useSummary';
import { StatsPage } from '@/features/stats/StatsPage';
import { formatShortDate } from '@/lib/date';
import { space, useTheme } from '@/theme';

/** 종목 하나: 지금 추정 1RM(맨몸은 최대 횟수) + 6개월 변화 그래프 */
const Exercise = () => {
  const theme = useTheme();
  const { name } = useLocalSearchParams<{ name?: string }>();
  const { summary, error } = useSummary();
  const [width, setWidth] = useState<number>(0);

  const e = summary?.exercises.find((x) => x.name === name);
  const series = useMemo(() => {
    if (!e) return null;
    const values = e.series.map((p) => p.value);
    const first = values[0] ?? 0;
    const last = values[values.length - 1] ?? 0;
    return { points: e.series, stats: { first, last, min: Math.min(...values), max: Math.max(...values), delta: last - first } };
  }, [e]);

  const bw = e ? isBodyweight(e) : false;
  const unit = bw ? '회' : 'kg';

  return (
    <StatsPage title={name ?? '종목'} back="웨이트" fallback="/stats/weight" loading={!summary && !error} error={error}>
      {summary && !e ? <Message text="이 종목의 최근 6개월 기록이 없어요." /> : null}
      {e && series ? (
        <Card kind="weight" style={{ gap: space(4) }}>
          <View style={{ gap: 2 }}>
            <T variant="label">{bw ? '최대 횟수' : '추정 1RM'}</T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(1.5) }}>
              <T variant="numXl" color={theme.weight.ink}>
                {bw ? e.top_reps : e.estimated_1rm}
              </T>
              <T variant="label">{unit}</T>
              {e.series.length > 1 ? (
                <T variant="numSm" style={{ marginLeft: space(2) }}>
                  {signed(e.delta_1rm)}
                  {unit}
                </T>
              ) : null}
            </View>
            <T variant="caption">
              최근 {formatShortDate(e.last_date)} · {bw ? `맨몸 ${e.top_reps}회` : `${e.top_weight_kg}kg × ${e.top_reps}회`} · {e.sets}세트
            </T>
          </View>
          <View onLayout={(ev) => setWidth(ev.nativeEvent.layout.width)}>
            {width > 0 ? (
              e.series.length > 1 ? (
                <TrendChart series={series} label="최근 6개월" unit={unit} width={width} color={theme.weight.solid} />
              ) : (
                <Message text="기록이 한 번뿐이라 아직 변화가 없어요. 다음 기록부터 그래프가 그려져요." />
              )
            ) : null}
          </View>
        </Card>
      ) : null}
    </StatsPage>
  );
};

export default Exercise;
