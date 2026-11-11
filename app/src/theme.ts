import { Platform, useColorScheme } from 'react-native';

// 레트로 픽셀 "다마고치": 민트 몸체 · 회녹색 LCD · 잉크색 3px 외곽선 · 아래 두께가 있는 버튼.
// - 모든 외곽선은 같은 잉크색 3px (outline). 크림 = 선택 · 주요 버튼, 빨강(led) = 켜짐 · 현재
// - 몸체(mint)는 오늘 화면의 달걀 기기 · 주요 면 · 탭 바, 회녹색 LCD(sheet)는 묶음 · 입력 · 차트 바탕
// - 다크 모드는 "밤": 몸체와 바탕을 어둡게, 외곽선은 거의 검정
// 글자 조합은 4.5:1 이상, 입력 테두리(border)는 바탕 대비 3:1 이상. (색 조합은 scripts 없이 수식으로 확인한 값)

export interface Theme {
  dark: boolean;
  /** 바탕 */
  paper: string;
  /** 글자 */
  ink: string;
  /** 민트 몸체(주요 면) 위 글자 */
  onInk: string;
  /** 민트 몸체 위 보조 글자 */
  onInkSoft: string;
  /** 회녹색 LCD 면: 묶음 · 차트 바탕 */
  sheet: string;
  /** LCD 안쪽 그늘(왼쪽 · 위 3px) */
  sheetShade: string;
  /** LCD 안 구분선 */
  line: string;
  /** 입력 테두리 (3:1 이상) */
  border: string;
  /** 보조 글자 (4.5:1 이상) */
  muted: string;
  danger: string;
  dangerSoft: string;
  // 하드웨어 부품
  /** 외곽선 · 버튼 아래 두께 · 그림자 */
  outline: string;
  cream: string;
  creamShade: string;
  /** 크림 위 글자 */
  onCream: string;
  /** 켜짐 · 현재 */
  led: string;
  /** 기본 버튼 면 */
  face: string;
  mint: string;
  mintShade: string;
  mintLight: string;
  mintEdge: string;
  /** 입력 상자 바탕 */
  field: string;
  /** 원형 키 */
  key: string;
  keyShade: string;
  /** 도트 펫: 윤곽 · 몸 */
  petInk: string;
  petBody: string;
  /** 달성 진하기 1~4 칸 색과 그 위 글자 */
  level: readonly { bg: string; fg: string }[];
}

const light: Theme = {
  dark: false,
  paper: '#DBE5E1',
  ink: '#1F2D3A',
  onInk: '#1F2D3A',
  onInkSoft: '#27423B',
  sheet: '#CFD8BD',
  sheetShade: '#B0BD9C',
  line: '#7E8B6C',
  border: '#1F2D3A',
  muted: '#475248',
  danger: '#9C3222',
  dangerSoft: '#F3D4CB',
  outline: '#1F2D3A',
  cream: '#F4E7B4',
  creamShade: '#CDB868',
  onCream: '#1F2D3A',
  led: '#D6452F',
  face: '#E8E4D8',
  mint: '#9FC3BB',
  mintShade: '#82A79E',
  mintLight: '#BCDBD3',
  mintEdge: '#3F625B',
  field: '#F7FBFA',
  key: '#E0A45A',
  keyShade: '#B97E35',
  petInk: '#232D26',
  petBody: '#9FB08C',
  level: [
    { bg: '#B7CA9A', fg: '#1F2D3A' },
    { bg: '#86AB6C', fg: '#14210F' },
    { bg: '#4F7A45', fg: '#FFFFFF' },
    { bg: '#232D26', fg: '#F4E7B4' },
  ],
};

const dark: Theme = {
  dark: true,
  paper: '#161C1F',
  ink: '#E8ECEC',
  onInk: '#EAF3F0',
  onInkSoft: '#BFD3CD',
  sheet: '#1F2B24',
  sheetShade: '#17211B',
  line: '#46584A',
  border: '#7F9A93',
  muted: '#A9B5AD',
  danger: '#FF8A7A',
  dangerSoft: '#3D1D18',
  outline: '#070A0C',
  cream: '#E9D99A',
  creamShade: '#B9A85F',
  onCream: '#1F2D3A',
  led: '#FF6A52',
  face: '#43565B',
  mint: '#33504A',
  mintShade: '#27403B',
  mintLight: '#44665F',
  mintEdge: '#0B1210',
  field: '#0F1517',
  key: '#B07F3F',
  keyShade: '#85601F',
  petInk: '#CFD8BD',
  petBody: '#456B4D',
  level: [
    { bg: '#2F4A35', fg: '#E8ECEC' },
    { bg: '#47703F', fg: '#FFFFFF' },
    { bg: '#76A25F', fg: '#10190D' },
    { bg: '#CFD8BD', fg: '#10190D' },
  ],
};

export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

/** #rrggbb + 투명도 → rgba() */
export const alpha = (hex: string, a: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** 잔디 진하기 1~4 → 투명도 (범례 등 보조용) */
export const LEVEL_ALPHA = [0, 0.18, 0.4, 0.7, 1] as const;

export const space = (n: number): number => n * 4;

// 도트 세계라 모서리는 거의 각지게. 둥근 것은 원형 키(pill)뿐이다
export const radius = { group: 4, box: 2, cell: 0, pill: 999 } as const;

/** 외곽선 두께: 모든 부품 공통 */
export const OUTLINE = 3;

// 한 열, 최대 폭 560, 좌우 여백 20
export const layout = { maxWidth: 560, gutter: 20 } as const;

// 한글 도트 글꼴 Galmuri(OFL). 불러오기 전에는 시스템 고딕으로 보인다. 길게 읽는 글(코치 답변)은 sans 를 쓴다
const SYSTEM = "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";
const web = Platform.OS === 'web';
const withFallback = (family: string): string => (web ? `${family}, ${SYSTEM}` : family);

export const fonts = {
  sans: web ? SYSTEM : undefined,
  px: withFallback('Galmuri11'),
  pxBold: withFallback('Galmuri11Bold'),
  /** 14px 배수에서 또렷하다: 큰 제목 · 숫자 */
  pxLg: withFallback('Galmuri14'),
  num: withFallback('Galmuri14'),
  numBold: withFallback('Galmuri14'),
} as const;
