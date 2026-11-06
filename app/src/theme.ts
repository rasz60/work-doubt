import { Platform, useColorScheme } from 'react-native';

// 흑백 트레이닝 노트: 흰 종이 위 검은 글자. 색 대신 크기 · 굵기 · 반전(검은 면 위 흰 글자)으로 위계를 만든다.
// - 반전 면은 화면마다 한 곳, 그 화면의 주된 행동에만 쓴다 (오늘의 계획 · 저장 버튼)
// - 묶음은 선이 아니라 옅은 회색 면(sheet)으로 나눈다
// - 운동 종류는 색이 아니라 기호로 구분한다 (KindMark: ● 러닝 ■ 웨이트 ▲ 기타 — 휴식)
// - 빨강은 지우기 확인에만
// 모든 글자 조합은 4.5:1 이상, 입력 테두리(border)는 바탕 대비 3:1 이상.

export interface Theme {
  dark: boolean;
  /** 바탕 */
  paper: string;
  /** 글자 · 반전 면 · 주 버튼 */
  ink: string;
  /** 반전 면 위 글자 (= paper) */
  onInk: string;
  /** 목록 묶음 · 입력 바탕 */
  sheet: string;
  /** 묶음 안 구분선 */
  line: string;
  /** 입력 테두리 (3:1 이상) */
  border: string;
  /** 보조 글자 (4.5:1 이상) */
  muted: string;
  danger: string;
  dangerSoft: string;
}

const light: Theme = {
  dark: false,
  paper: '#FFFFFF',
  ink: '#000000',
  onInk: '#FFFFFF',
  sheet: '#F3F4F5',
  line: '#DCDDE0',
  border: '#8A8D93',
  muted: '#5E6166',
  danger: '#C62828',
  dangerSoft: '#FDECEC',
};

const dark: Theme = {
  dark: true,
  paper: '#000000',
  ink: '#FFFFFF',
  onInk: '#000000',
  sheet: '#161718',
  line: '#2C2D30',
  border: '#6B6E74',
  muted: '#A6A8AD',
  danger: '#FF6B6B',
  dangerSoft: '#3A1717',
};

export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

/** #rrggbb + 투명도 → rgba() */
export const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** 잔디 진하기 1~4 → ink 의 투명도 */
export const LEVEL_ALPHA = [0, 0.18, 0.4, 0.7, 1] as const;

export const space = (n: number): number => n * 4;

// 둥글기: 반전 면 · 묶음 > 입력 · 버튼 > 칩(완전히 둥글게). 그림자는 쓰지 않는다
export const radius = { group: 20, box: 14, cell: 10, pill: 999 } as const;

// 한 열, 최대 폭 560, 좌우 여백 20
export const layout = { maxWidth: 560, gutter: 20 } as const;

// 한글은 Pretendard(웹) · 기기 기본 글꼴. 숫자는 좁은 숫자체 — 숫자가 화면의 주인공이다
const sans = Platform.OS === 'web' ? "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif" : undefined;

export const fonts = {
  sans,
  num: 'BarlowCondensed_600SemiBold',
  numBold: 'BarlowCondensed_700Bold',
} as const;
