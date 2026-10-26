import React from 'react';
import { View } from 'react-native';

import { Card, Message, ProgressBar, T } from '@/components/ui';
import { useSummary } from '@/features/stats/useSummary';
import { StatsPage } from '@/features/stats/StatsPage';
import { formatNumber } from '@/lib/date';
import { space, useTheme } from '@/theme';

const ratio = (actual: number, target: number): number => (target > 0 ? actual / target : actual > 0 ? 1 : 0);

/** 소비 칼로리: 오늘 · 이번 달, 각각 목표 대비 */
const Kcal = () => {
  const theme = useTheme();
  const { summary, error } = useSummary();

  const day = summary?.today_kcal;
  const month = summary?.month_kcal;
  const toDate = month && month.target_to_date > 0 ? Math.round((month.actual / month.target_to_date) * 100) : 0;

  return (
    <StatsPage title="소비 칼로리" caption="운동으로 쓴 칼로리 · 계획의 목표와 비교해요" loading={!summary && !error} error={error}>
      {summary?.weight_assumed ? <Message text="체중 기록이 없어 70kg 기준으로 추정했어요. 기록 › 신체에 체중을 넣으면 더 정확해져요." /> : null}
      {day && month && summary ? (
        <>
          <Card style={{ gap: space(3) }}>
            <T variant="label">오늘</T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(1.5) }}>
              <T variant="numXl">{formatNumber(day.actual)}</T>
              <T variant="label">{day.target > 0 ? `/ ${formatNumber(day.target)} kcal` : 'kcal'}</T>
            </View>
            <ProgressBar value={ratio(day.actual, day.target)} />
            {day.target === 0 ? <T variant="caption">오늘은 계획에 칼로리 목표가 없어요.</T> : null}
          </Card>

          <Card style={{ gap: space(3) }}>
            <T variant="label">{Number(summary.month.slice(5, 7))}월</T>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(1.5) }}>
              <T variant="numLg">{formatNumber(month.actual)}</T>
              <T variant="label">/ {formatNumber(month.target)} kcal</T>
            </View>
            <ProgressBar
              value={ratio(month.actual, month.target)}
              marker={month.target > 0 ? month.target_to_date / month.target : undefined}
              color={theme.textMuted}
            />
            {month.target_to_date > 0 ? (
              <T variant="caption">
                세로선은 오늘까지 채웠어야 할 만큼이에요. 지금 그 목표의{' '}
                <T variant="caption" color={theme.text} style={{ fontWeight: '700' }}>
                  {toDate}%
                </T>
                를 채웠어요.
              </T>
            ) : null}
          </Card>
        </>
      ) : null}
    </StatsPage>
  );
};

export default Kcal;
