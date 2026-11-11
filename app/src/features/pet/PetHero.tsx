import React from 'react';
import { Platform, View, type ViewStyle } from 'react-native';

import { CellGauge, Hearts, Pet, PixelArt, SPARK } from '@/components/Pixel';
import { T } from '@/components/ui';
import { filledCells, type PetState } from '@/features/pet/petMood';
import { fonts, space, useTheme } from '@/theme';

interface PetHeroProps {
  state: PetState;
  weekDone: number;
  weekPlanned: number;
  /** 이번 달 칼로리 목표를 오늘까지 채운 비율(%) — 없으면 줄을 감춘다 */
  kcalPct?: number;
}

const GAUGE_CELLS = 10;

/**
 * 오늘 화면의 히어로: 달걀 모양 기기 + LCD 안의 펫.
 * 펫 기분 · 하트 · 게이지는 모두 이번 주 기록에서 계산한 값이다. 달걀 위 고리는 장식(앱 전환 버튼은 화면 오른쪽 위에 따로 뜬다).
 */
export const PetHero = ({ state, weekDone, weekPlanned, kcalPct }: PetHeroProps) => {
  const theme = useTheme();
  const weekRatioValue = weekPlanned > 0 ? weekDone / weekPlanned : weekDone / 7;

  // 달걀 몸체: 위쪽은 둥글고 아래는 납작. 안쪽 그늘 · 하이라이트 · 아래 두께는 box-shadow (웹 · 새 아키텍처)
  const egg: ViewStyle = {
    width: '100%',
    maxWidth: 320,
    alignSelf: 'center',
    backgroundColor: theme.mint,
    borderWidth: 4,
    borderColor: theme.mintEdge,
    paddingTop: 44,
    paddingBottom: 44,
    paddingHorizontal: 32,
    ...(Platform.OS === 'web'
      ? ({
          borderTopLeftRadius: '50% 58%',
          borderTopRightRadius: '50% 58%',
          borderBottomLeftRadius: '46% 42%',
          borderBottomRightRadius: '46% 42%',
          boxShadow: `inset -8px -10px 0 ${theme.mintShade}, inset 7px 7px 0 ${theme.mintLight}, 0 8px 0 ${theme.mintEdge}`,
        } as object)
      : ({
          borderTopLeftRadius: 150,
          borderTopRightRadius: 150,
          borderBottomLeftRadius: 120,
          borderBottomRightRadius: 120,
          boxShadow: `inset -8px -10px 0 ${theme.mintShade}, inset 7px 7px 0 ${theme.mintLight}, 0 8px 0 ${theme.mintEdge}`,
        } as object)),
  };

  return (
    <View style={{ paddingTop: 14, paddingBottom: 10 }}>
      <View style={egg}>
        {/* 고리: 장식. 비워 둔다 */}
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: -18, alignSelf: 'center', width: 28, height: 28, borderRadius: 14, borderWidth: 5, borderColor: theme.mintEdge }}
        />
        <T variant="small" color={theme.onInk} style={{ textAlign: 'center', marginBottom: space(2) }}>
          ae:p 운동기록
        </T>

        <View style={{ backgroundColor: theme.sheet, borderWidth: 4, borderColor: theme.outline, borderRadius: 6, padding: 8, overflow: 'hidden' }}>
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 3, backgroundColor: theme.sheetShade }} />
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: theme.sheetShade }} />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Hearts value={state.hearts} />
            <T variant="small" color={theme.petInk}>
              이번 주 {weekDone}일
            </T>
          </View>

          <View style={{ height: 96, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 6 }}>
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 4, height: 3, backgroundColor: theme.petInk }} />
            {state.mood === 'cheer' ? (
              <>
                <View style={{ position: 'absolute', left: '22%', top: 14 }}>
                  <PixelArt bitmap={SPARK} cell={3} colors={{ k: theme.petInk, w: theme.led }} />
                </View>
                <View style={{ position: 'absolute', right: '22%', top: 30 }}>
                  <PixelArt bitmap={SPARK} cell={2} colors={{ k: theme.petInk, w: theme.led }} />
                </View>
              </>
            ) : null}
            {state.mood === 'sleepy' ? (
              <T variant="small" color={theme.petInk} style={{ position: 'absolute', right: '26%', top: 18 }}>
                z z
              </T>
            ) : null}
            <Pet mood={state.mood} cell={6} hop label={`펫 기분: ${MOOD_LABEL[state.mood]}`} />
          </View>

          <T variant="label" color={theme.petInk} style={{ textAlign: 'center', marginBottom: space(2), fontFamily: fonts.pxBold }}>
            {state.say}
          </T>

          <View style={{ gap: 6 }}>
            <Meter label="이번 주" text={weekPlanned > 0 ? `${weekDone}/${weekPlanned}` : `${weekDone}일`} cells={filledCells(weekRatioValue, GAUGE_CELLS)} a11y={weekPlanned > 0 ? `이번 주 계획 ${weekPlanned}일 중 ${weekDone}일` : `이번 주 ${weekDone}일 운동`} />
            {kcalPct !== undefined ? <Meter label="칼로리" text={`${kcalPct}%`} cells={filledCells(kcalPct / 100, GAUGE_CELLS)} a11y={`이번 달 칼로리 목표 ${kcalPct}%`} /> : null}
          </View>
        </View>
      </View>
    </View>
  );
};

const MOOD_LABEL = { cheer: '신남', happy: '기쁨', normal: '보통', sleepy: '졸림' } as const;

const Meter = ({ label, text, cells, a11y }: { label: string; text: string; cells: number; a11y: string }) => {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <T variant="small" color={theme.petInk} style={{ width: 48 }}>
        {label}
      </T>
      <View style={{ flex: 1 }}>
        <CellGauge cells={cells} total={GAUGE_CELLS} label={a11y} />
      </View>
      <T variant="small" color={theme.petInk} style={{ minWidth: 40, textAlign: 'right' }}>
        {text}
      </T>
    </View>
  );
};
