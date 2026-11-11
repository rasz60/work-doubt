import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { useTheme } from '@/theme';
import type { PlanKind, WorkoutKind } from '@/types';

/** 운동 종류 기호. 흑백이라 색 대신 모양으로 구분한다: ● 러닝 ■ 웨이트 ▲ 기타 — 휴식 */
export const KIND_GLYPHS: Record<WorkoutKind | PlanKind, string> = { run: '●', weight: '■', other: '▲', rest: '—' };

interface KindMarkProps {
  kind?: WorkoutKind | PlanKind;
  size?: number;
  color?: string;
}

export const KindMark = ({ kind, size = 10, color }: KindMarkProps) => {
  const theme = useTheme();
  const fill = color ?? theme.ink;
  return (
    <Svg width={size} height={size} viewBox="0 0 10 10" accessibilityElementsHidden importantForAccessibility="no">
      {kind === 'run' ? <Circle cx={5} cy={5} r={5} fill={fill} /> : null}
      {kind === 'weight' ? <Rect x={0.5} y={0.5} width={9} height={9} fill={fill} /> : null}
      {kind === 'other' ? <Path d="M5 0.6 9.6 9.4H0.4z" fill={fill} /> : null}
      {kind === 'rest' || kind === undefined ? <Rect x={0.5} y={4} width={9} height={2} rx={1} fill={fill} /> : null}
    </Svg>
  );
};
