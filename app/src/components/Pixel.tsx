import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { T } from '@/components/ui';
import { space, useTheme } from '@/theme';
import type { PetMood } from '@/features/pet/petMood';

// 도트 비트맵: 글자 하나가 한 칸. 'k' 윤곽 · 'a' 몸 · 'w' 하이라이트 · '.' 비움
type Bitmap = readonly string[];

const BASE = ['............', '....kkkk....', '..kkaaaakk..', '.kaaaaaaaak.', '.kaakaakaak.', '.kaaaaaaaak.', '.kaaaaaaaak.', '.kaaaaaaaak.', '..kaaaaaak..', '..kkaaaakk..', '...kk..kk...', '............'];
const patch = (rows: Record<number, string>): Bitmap => BASE.map((r, i) => rows[i] ?? r);

export const PET: Record<PetMood, Bitmap> = {
  // 눈 두 점 + 웃는 입
  cheer: patch({ 6: '.kaakaakaak.', 7: '.kaaakkaaak.' }),
  happy: patch({ 6: '.kaakaakaak.', 7: '.kaaakkaaak.' }),
  // 눈 두 점 + 일자 입
  normal: patch({ 6: '.kaakkkkaak.' }),
  // 감은 눈 + 처진 입
  sleepy: patch({ 4: '.kaaaaaaaak.', 5: '.kakkaakkaak.', 6: '.kaaakkaaak.', 7: '.kaakaakaak.' }),
};

export const HEART_SHAPE: Bitmap = ['.kk...kk.', 'kaakkkaak', 'kaaaaaaak', 'kaaaaaaak', '.kaaaaak.', '..kaaak..', '...kak...', '....k....'];
export const SPARK: Bitmap = ['..k..', '..k..', 'kkwkk', '..k..', '..k..'];

export const TAB_ICONS: Record<string, Bitmap> = {
  index: ['..kkkk..', '.k....k.', 'k..k...k', 'k..k...k', 'k..kkk.k', 'k......k', '.k....k.', '..kkkk..'],
  calendar: ['.k....k.', 'kkkkkkkk', 'k......k', 'k.k.k..k', 'k......k', 'k..k.k.k', 'k......k', 'kkkkkkkk'],
  coach: ['kkkkkkkk', 'k......k', 'k.k.k.kk', 'k......k', 'kkkkkkkk', '..kk....', '...k....', '........'],
  me: ['..kkkk..', '.k....k.', '.k....k.', '..kkkk..', '.kkkkkk.', 'k..kk..k', 'k..kk..k', 'kkkkkkkk'],
};

interface PixelArtProps {
  bitmap: Bitmap;
  /** 한 칸의 크기(px) */
  cell: number;
  colors: Partial<Record<string, string>>;
  /** 의미 있는 그림이면 설명을 준다. 장식이면 비워 스크린 리더에서 숨긴다 */
  label?: string;
}

/** 색마다 path 하나로 그린 비트맵. 칸 경계를 또렷하게 (crispEdges) */
export const PixelArt = ({ bitmap, cell, colors, label }: PixelArtProps) => {
  const h = bitmap.length;
  const w = bitmap[0]?.length ?? 0;
  const paths: Record<string, string> = {};
  bitmap.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (colors[ch]) paths[ch] = `${paths[ch] ?? ''}M${x} ${y}h1v1h-1z`;
    });
  });
  return (
    <Svg
      width={w * cell}
      height={h * cell}
      viewBox={`0 0 ${w} ${h}`}
      accessibilityRole={label ? 'image' : undefined}
      accessibilityLabel={label}
      accessibilityElementsHidden={!label}
      importantForAccessibility={label ? 'yes' : 'no-hide-descendants'}
      aria-hidden={label ? undefined : true}
    >
      {Object.entries(paths).map(([ch, d]) => (
        <Path key={ch} d={d} fill={colors[ch]} />
      ))}
    </Svg>
  );
};

/** 계단식 두 걸음(0/1)으로 번갈아 바뀌는 값. 모션 줄이기 설정이면 멈춘다 */
export const useStepTick = (ms = 500, active = true): boolean => {
  const [on, setOn] = useState<boolean>(false);
  const [reduce, setReduce] = useState<boolean>(true);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  useEffect(() => {
    if (!active || reduce) {
      setOn(false);
      return undefined;
    }
    const id = setInterval(() => setOn((v) => !v), ms);
    return () => clearInterval(id);
  }, [active, reduce, ms]);
  return on;
};

interface PetProps {
  mood?: PetMood;
  cell?: number;
  hop?: boolean;
  /** 의미 있는 그림이면 설명 */
  label?: string;
}

/** 도트 펫. hop 이면 계단식으로 폴짝 (장식 모션, 화면당 한 곳만) */
export const Pet = ({ mood = 'normal', cell = 5, hop = false, label }: PetProps) => {
  const theme = useTheme();
  const up = useStepTick(500, hop);
  return (
    <View style={{ transform: [{ translateY: up ? -cell : 0 }] }}>
      <PixelArt bitmap={PET[mood]} cell={cell} colors={{ k: theme.petInk, a: theme.petBody }} label={label} />
    </View>
  );
};

/** 활력 하트 0~3 (켜진 하트는 빨강) */
export const Hearts = ({ value, total = 3 }: { value: number; total?: number }) => {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`활력 ${value} / ${total}`}
      style={{ flexDirection: 'row', gap: 4 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <PixelArt key={i} bitmap={HEART_SHAPE} cell={2} colors={{ k: theme.petInk, a: i < value ? theme.led : theme.sheetShade, w: theme.led }} />
      ))}
    </View>
  );
};

/** 칸으로 채우는 게이지: ratio 0~1 */
export const CellGauge = ({ cells, total = 10, label }: { cells: number; total?: number; label: string }) => {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: total, now: cells }}
      style={{ flexDirection: 'row', gap: 2, borderWidth: 2, borderColor: theme.petInk, padding: 2, backgroundColor: theme.sheet }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 8, backgroundColor: i < cells ? theme.petInk : 'transparent' }} />
      ))}
    </View>
  );
};

/** 펫이 말하는 줄: 작은 펫 + 말풍선 (빈 상태 · 안내) */
export const PetNote = ({ mood = 'normal', children, hop = true }: { mood?: PetMood; children: React.ReactNode; hop?: boolean }) => {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(3) }}>
      <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: theme.sheet, borderWidth: 3, borderColor: theme.outline }}>
        <Pet mood={mood} cell={3} hop={hop} />
      </View>
      <View style={{ flex: 1, minWidth: 0, backgroundColor: theme.sheet, borderWidth: 3, borderColor: theme.outline, paddingHorizontal: space(3), paddingVertical: space(2.5) }}>
        {typeof children === 'string' ? <T variant="caption" color={theme.ink}>{children}</T> : children}
      </View>
    </View>
  );
};

/** 첫 화면 · 불러오는 중: 펫이 폴짝 (모션 줄이기면 정지) */
export const Loading = ({ label = '불러오는 중…' }: { label?: string }) => {
  const theme = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ alignItems: 'center', gap: space(3), paddingVertical: space(8) }}>
      <View style={{ width: 96, height: 76, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6, backgroundColor: theme.sheet, borderWidth: 3, borderColor: theme.outline }}>
        <Pet mood="normal" cell={4} hop />
        <View style={{ position: 'absolute', left: 6, right: 6, bottom: 4, height: 2, backgroundColor: theme.petInk }} />
      </View>
      <T variant="caption" color={theme.ink}>
        {label}
      </T>
    </View>
  );
};
