import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { Card, Message, T } from '@/components/ui';
import { isBodyweight, signed, useSummary } from '@/features/stats/useSummary';
import { StatsPage } from '@/features/stats/StatsPage';
import { formatShortDate } from '@/lib/date';
import { space, useTheme } from '@/theme';

/** 웨이트: 종목마다 한 줄 (최근 기록 · 추정 1RM · 6개월 변화). 누르면 그 종목 그래프 */
const Weight = () => {
  const theme = useTheme();
  const { summary, error } = useSummary();
  const exercises = summary?.exercises ?? [];

  return (
    <StatsPage title="웨이트" caption="최근 6개월 · 종목을 누르면 변화가 보여요" loading={!summary && !error} error={error}>
      {summary && exercises.length === 0 ? (
        <Message text="최근 6개월 웨이트 기록이 없어요. 기록 탭에서 종목 · 무게 · 횟수를 남겨 보세요." />
      ) : null}
      {exercises.length > 0 ? (
        <Card kind="weight" style={{ gap: 0, paddingVertical: space(1) }}>
          {exercises.map((e, i) => {
            const bw = isBodyweight(e);
            return (
              <Pressable
                key={e.name}
                onPress={() => router.push({ pathname: '/stats/exercise', params: { name: e.name } })}
                accessibilityRole="button"
                accessibilityLabel={`${e.name} 변화 보기`}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: space(3),
                  paddingVertical: space(3.5),
                  borderTopWidth: i === 0 ? 0 : 1,
                  borderTopColor: theme.line,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <T variant="bodyStrong" numberOfLines={1} style={{ fontSize: 16 }}>
                    {e.name}
                  </T>
                  <T variant="caption">
                    {formatShortDate(e.last_date)} · {bw ? `맨몸 ${e.top_reps}회` : `${e.top_weight_kg}kg × ${e.top_reps}회`}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2 }}>
                    <T variant="numMd">{bw ? e.top_reps : e.estimated_1rm}</T>
                    <T variant="small">{bw ? '회' : 'kg'}</T>
                  </View>
                  <T variant="small" color={e.delta_1rm > 0 ? theme.weight.ink : theme.textMuted}>
                    {e.series.length > 1 ? `${signed(e.delta_1rm)}${bw ? '회' : 'kg'}` : '첫 기록'}
                  </T>
                </View>
                <T variant="heading" color={theme.textMuted}>
                  ›
                </T>
              </Pressable>
            );
          })}
        </Card>
      ) : null}
      {exercises.length > 0 ? <T variant="caption">무게 종목은 추정 1RM(한 번에 들 수 있는 최대 무게), 맨몸 종목은 최대 횟수예요.</T> : null}
    </StatsPage>
  );
};

export default Weight;
