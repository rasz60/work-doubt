import { useColorScheme } from 'react-native';

export interface Theme {
  bg: string;
  surface: string;
  border: string;
  grid: string;
  text: string;
  textMuted: string;
  accent: string; // 모노크롬이라 강조색은 본문색과 같다. 차트 선·주 버튼에 쓴다.
  onAccent: string; // accent 배경 위 글자색
  danger: string; // 오류 메시지 전용. 화면에서 유일한 유채색이다.
  up: string;
  down: string;
}

// 블랙 & 화이트 모노크롬. 위계는 색이 아니라 굵기·크기·자간·여백으로 만든다.
const darkTheme: Theme = {
  bg: '#000000',
  surface: '#0b0b0b',
  border: '#2a2a2a',
  grid: '#1c1c1c',
  text: '#ffffff',
  textMuted: '#8c8c8c',
  accent: '#ffffff',
  onAccent: '#000000',
  danger: '#ff5a4f',
  up: '#ffffff',
  down: '#ffffff',
};

const lightTheme: Theme = {
  bg: '#ffffff',
  surface: '#ffffff',
  border: '#e5e5e5',
  grid: '#f0f0f0',
  text: '#000000',
  textMuted: '#737373',
  accent: '#000000',
  onAccent: '#ffffff',
  danger: '#d92d20',
  up: '#000000',
  down: '#000000',
};

//export const useTheme = (): Theme => (useColorScheme() === 'light' ? lightTheme : darkTheme);
export const useTheme = (): Theme => lightTheme;

export const space = (n: number): number => n * 4;
export const radius = 0;

// 영문 대문자 라벨용 자간. 한글에는 쓰지 않는다.
export const tracking = { tight: -0.5, label: 1.5, wide: 2.5 } as const;
