import { Platform, useColorScheme } from 'react-native';

import type { PlanKind, WorkoutKind } from '@/types';

// 체육관 기록판: 옅은 회색 판 위에 흰 카드, 입력은 테두리 있는 상자.
// 색은 장식이 아니라 "무슨 운동인지"를 뜻한다 — 러닝 파랑 · 웨이트 주황 · 기타 청록. 잔디 · 기록 · 저장 버튼이 같은 색을 쓴다.
// 모든 글자 조합은 4.5:1 이상, 입력 상자 테두리는 3:1 이상.

export interface KindColors {
  /** 채우는 색 (버튼 · 잔디 진한 칸) — 위 글자는 onKind */
  solid: string;
  /** 흰 카드 위 글자 */
  ink: string;
  /** 옅은 바탕 (선택된 칩 · 잔디 옅은 칸) */
  soft: string;
}

export interface Theme {
  dark: boolean;
  bg: string; // 기록판
  surface: string; // 카드
  field: string; // 입력 상자 안
  fieldBorder: string;
  line: string; // 카드 안 구분선
  text: string;
  textMuted: string;
  onKind: string; // 종류 색 · 잉크 위 글자
  danger: string;
  dangerSoft: string;
  run: KindColors;
  weight: KindColors;
  other: KindColors;
  rest: KindColors;
}

const light: Theme = {
  dark: false,
  bg: '#eef0f3',
  surface: '#ffffff',
  field: '#f4f6f9',
  fieldBorder: '#8b93a0',
  line: '#e3e6eb',
  text: '#15181e',
  textMuted: '#5a6170',
  onKind: '#ffffff',
  danger: '#c8261b',
  dangerSoft: '#fdeceb',
  run: { solid: '#1f4fd8', ink: '#1f4fd8', soft: '#e8eeff' },
  weight: { solid: '#c2410c', ink: '#b83e0c', soft: '#ffeee3' },
  other: { solid: '#0b7468', ink: '#0b6e63', soft: '#e0f4f1' },
  rest: { solid: '#8b93a0', ink: '#5a6170', soft: '#e3e6eb' },
};

const dark: Theme = {
  dark: true,
  bg: '#0e1218',
  surface: '#171c24',
  field: '#1e242e',
  fieldBorder: '#5b6577',
  line: '#262c37',
  text: '#eceff4',
  textMuted: '#9ba4b4',
  onKind: '#0e1218',
  danger: '#ff6b5e',
  dangerSoft: '#3a1d1b',
  run: { solid: '#6e97ff', ink: '#6e97ff', soft: '#1b2742' },
  weight: { solid: '#ff8a4c', ink: '#ff8a4c', soft: '#3a2418' },
  other: { solid: '#3cc7b3', ink: '#3cc7b3', soft: '#15332f' },
  rest: { solid: '#5b6577', ink: '#9ba4b4', soft: '#262c37' },
};

export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

export const kindColors = (theme: Theme, kind?: WorkoutKind | PlanKind): KindColors =>
  kind === 'run' ? theme.run : kind === 'weight' ? theme.weight : kind === 'other' ? theme.other : theme.rest;

/** #rrggbb + 투명도 → rgba() (잔디 단계에 쓴다) */
export const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export const space = (n: number): number => n * 4;

// 둥글기는 위계를 따른다: 카드 > 상자 · 타일 > 칩(완전히 둥글게)
export const radius = { card: 16, box: 10, tile: 12, pill: 999 } as const;

// 한글은 Pretendard(웹, 포털과 같은 글꼴) · 기기 기본 글꼴. 숫자는 전광판 같은 좁은 숫자체.
const sans = Platform.OS === 'web' ? "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" : undefined;

export const fonts = {
  sans,
  num: 'BarlowCondensed_600SemiBold',
  numBold: 'BarlowCondensed_700Bold',
} as const;
