import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { space, tracking, useTheme } from '@/theme';
import type { MetricPoint, SeriesStats } from '@/types';

interface TrendChartProps {
  series: { points: MetricPoint[]; stats: SeriesStats };
  label: string;
  unit?: string;
  height?: number;
  width?: number;
  /** 값 표시 (기본: 소수 한 자리 + unit) */
  format?: (value: number) => string;
  /** 변동폭 표시 (기본: 부호 + 소수 한 자리 + unit) */
  formatDelta?: (delta: number) => string;
  emptyText?: string;
}

interface Scaled {
  x: number;
  y: number;
  value: number;
  measuredAt: string;
}

const PADDING = { top: 16, right: 16, bottom: 22, left: 16 } as const;

/**
 * TrendChart 는 지표 1종의 변동폭을 선 하나로 보여준다.
 * - 시리즈가 하나뿐이므로 범례는 두지 않고 제목이 그 역할을 한다.
 * - 모든 점에 숫자를 찍지 않고 처음/마지막만 직접 라벨링한다.
 * - 축은 y 하나뿐이다(이중 축 금지).
 */
export const TrendChart = ({
  series,
  label,
  unit = '',
  height = 180,
  width = 320,
  format,
  formatDelta,
  emptyText = '기록이 없습니다. 지표를 입력하면 변동폭이 표시됩니다.',
}: TrendChartProps) => {
  const show = format ?? ((value: number): string => `${value.toFixed(1)}${unit}`);
  const showDelta = formatDelta ?? ((delta: number): string => `${delta > 0 ? '+' : ''}${delta.toFixed(1)}${unit}`);
  const theme = useTheme();
  const [selected, setSelected] = useState<number | null>(null);

  const innerWidth = width - PADDING.left - PADDING.right;
  const innerHeight = height - PADDING.top - PADDING.bottom;

  const points = useMemo<Scaled[]>(() => {
    const raw = series.points;
    if (raw.length === 0) return [];

    const values = raw.map((p) => p.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    // 평평한 시리즈가 0으로 나뉘지 않도록 최소 범위를 보장한다.
    const span = max - min < 0.1 ? 1 : max - min;

    return raw.map((point, index) => ({
      x: PADDING.left + (raw.length === 1 ? innerWidth / 2 : (index / (raw.length - 1)) * innerWidth),
      y: PADDING.top + innerHeight - ((point.value - min) / span) * innerHeight,
      value: point.value,
      measuredAt: point.measured_at,
    }));
  }, [series.points, innerWidth, innerHeight]);

  const path = useMemo<string>(
    () => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' '),
    [points],
  );

  const styles = useMemo(() => createStyles(theme), [theme]);

  if (points.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>{label}</Text>
        <Text style={styles.empty}>{emptyText}</Text>
      </View>
    );
  }

  const { delta, first, last } = series.stats;
  // 모노크롬이라 증감은 색이 아니라 부호로 구분한다. 변화가 없을 때만 흐리게.
  const deltaColor = delta === 0 ? theme.textMuted : delta > 0 ? theme.up : theme.down;
  const active = selected === null ? null : points[selected] ?? null;

  const pickNearest = (x: number): void => {
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs((points[nearest]?.x ?? 0) - x)) nearest = i;
    });
    setSelected(nearest);
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{label}</Text>
        <Text style={[styles.delta, { color: deltaColor }]}>{showDelta(delta)}</Text>
      </View>

      {/* 터치/클릭 지점에서 가장 가까운 점을 선택한다. 웹과 네이티브 모두 responder 로 동작한다. */}
      <View
        onStartShouldSetResponder={() => true}
        onResponderGrant={(event) => pickNearest(event.nativeEvent.locationX)}
        onResponderMove={(event) => pickNearest(event.nativeEvent.locationX)}
      >
      <Svg width={width} height={height}>
        {/* 기준선은 데이터보다 뒤로 물러나 있어야 한다. */}
        <Line
          x1={PADDING.left}
          y1={PADDING.top + innerHeight}
          x2={PADDING.left + innerWidth}
          y2={PADDING.top + innerHeight}
          stroke={theme.grid}
          strokeWidth={1}
        />

        <Path d={path} stroke={theme.accent} strokeWidth={1.5} fill="none" strokeLinejoin="round" />

        {/* 마지막 점만 상시 표시하고, 나머지는 선택 시에만 강조한다. */}
        <Circle
          cx={points[points.length - 1]?.x}
          cy={points[points.length - 1]?.y}
          r={4}
          fill={theme.accent}
          stroke={theme.bg}
          strokeWidth={2}
        />

        {active && (
          <>
            <Line
              x1={active.x}
              y1={PADDING.top}
              x2={active.x}
              y2={PADDING.top + innerHeight}
              stroke={theme.textMuted}
              strokeWidth={1}
              strokeDasharray="2,3"
            />
            <Circle cx={active.x} cy={active.y} r={5} fill={theme.bg} stroke={theme.accent} strokeWidth={1.5} />
          </>
        )}
      </Svg>
      </View>

      <View style={styles.footer}>
        <Text style={styles.axisLabel}>
          {formatDate(points[0]?.measuredAt)} · {show(first)}
        </Text>
        {active ? (
          <Text style={styles.selectedLabel}>
            {formatDate(active.measuredAt)} · {show(active.value)}
          </Text>
        ) : (
          <Text style={styles.axisLabel}>
            {formatDate(points[points.length - 1]?.measuredAt)} · {show(last)}
          </Text>
        )}
      </View>
    </View>
  );
};

const formatDate = (value?: string): string => (value ? value.slice(0, 10) : '-');

const createStyles = (theme: ReturnType<typeof useTheme>) =>
  StyleSheet.create({
    // 박스 카드 대신 위쪽 굵은 선 하나로 섹션을 나누는 에디토리얼 레이아웃.
    card: {
      borderTopColor: theme.text,
      borderTopWidth: 1,
      paddingTop: space(4),
      paddingBottom: space(6),
      gap: space(3),
    },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
    title: { color: theme.textMuted, fontSize: 12, fontWeight: '700' },
    delta: { fontSize: 32, fontWeight: '800', letterSpacing: tracking.tight },
    footer: { flexDirection: 'row', justifyContent: 'space-between' },
    axisLabel: { color: theme.textMuted, fontSize: 11, fontVariant: ['tabular-nums'] },
    selectedLabel: { color: theme.text, fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] },
    empty: { color: theme.textMuted, fontSize: 13 },
  });
