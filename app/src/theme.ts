import { useColorScheme } from 'react-native';

export interface Theme {
  bg: string;
  surface: string;
  border: string;
  grid: string;
  text: string;
  textMuted: string;
  accent: string; // 차트 1개 시리즈 색. 라이트/다크 각각 대비 검증 완료.
  up: string;
  down: string;
}

// 다크 모드는 라이트의 반전이 아니라 각 모드에서 따로 고른 값이다.
const darkTheme: Theme = {
  bg: '#101214',
  surface: '#1a1d22',
  border: '#2a2f38',
  grid: '#232830',
  text: '#f2f4f8',
  textMuted: '#98a1b0',
  accent: '#4f8cff',
  up: '#ff7a6b',
  down: '#3ad29f',
};

const lightTheme: Theme = {
  bg: '#f7f8fa',
  surface: '#ffffff',
  border: '#e2e6ec',
  grid: '#eef1f5',
  text: '#15181d',
  textMuted: '#5c6675',
  accent: '#2563eb',
  up: '#c2410c',
  down: '#0f766e',
};

export const useTheme = (): Theme => (useColorScheme() === 'light' ? lightTheme : darkTheme);

export const space = (n: number): number => n * 4;
export const radius = 12;
