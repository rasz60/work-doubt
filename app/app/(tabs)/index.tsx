import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, useWindowDimensions, View } from 'react-native';

import { TrendChart } from '@/components/TrendChart';
import { Message, Screen } from '@/components/ui';
import * as api from '@/api/endpoints';
import { space, useTheme } from '@/theme';
import { METRIC_LABELS, type MetricKind, type MetricSeries } from '@/types';

const CHART_KINDS: MetricKind[] = ['weight_kg', 'skeletal_muscle_kg', 'body_fat_percentage', 'bmi'];

const UNITS: Record<MetricKind, string> = {
  weight_kg: 'kg',
  height_cm: 'cm',
  skeletal_muscle_kg: 'kg',
  body_fat_percentage: '%',
  bmi: '',
};

// 변동폭 대시보드. 지표마다 차트를 하나씩 세로로 쌓는다(이중 축 대신 분리).
const Dashboard = () => {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const chartWidth = Math.min(width, 640) - space(4) * 2 - space(3) * 2;

  const [series, setSeries] = useState<MetricSeries[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  const load = useCallback(async (): Promise<void> => {
    setError('');
    try {
      const results = await Promise.all(CHART_KINDS.map((kind) => api.fetchMetricSeries(kind)));
      setSeries(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : '지표를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Screen>
      {loading ? (
        <ActivityIndicator />
      ) : (
        <ScrollView
          contentContainerStyle={{ gap: space(3) }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void load()} />}
        >
          <View style={{ gap: space(1) }}>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>최근 6개월 변동폭</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              차트를 누르면 해당 시점의 값을 볼 수 있습니다.
            </Text>
          </View>

          <Message text={error} tone="error" />

          {series.map((item) => (
            <TrendChart
              key={item.kind}
              series={item}
              label={METRIC_LABELS[item.kind]}
              unit={UNITS[item.kind]}
              width={chartWidth}
            />
          ))}
        </ScrollView>
      )}
    </Screen>
  );
};

export default Dashboard;
