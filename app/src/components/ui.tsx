import React from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type RefreshControlProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KindMark } from '@/components/KindMark';
import { addDays, formatLongDate, todayString } from '@/lib/date';
import { OUTLINE, fonts, layout, radius, space, useTheme } from '@/theme';
import type { PlanKind, WorkoutKind } from '@/types';

// ── 글자 ───────────────────────────────────────────────
// 한글 도트 글꼴 Galmuri. 크기 단계: 12 · 14 · 16 · 22 · 28 · 42 · 70 (Galmuri14 는 14의 배수에서 또렷하다)

const VARIANTS = {
  title: { fontSize: 28, lineHeight: 36, fontFamily: fonts.pxLg },
  heading: { fontSize: 22, lineHeight: 28, fontFamily: fonts.pxBold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fonts.px },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontFamily: fonts.pxBold },
  label: { fontSize: 14, lineHeight: 20, fontFamily: fonts.pxBold },
  caption: { fontSize: 14, lineHeight: 20, fontFamily: fonts.px },
  small: { fontSize: 12, lineHeight: 16, fontFamily: fonts.pxBold },
  numHero: { fontSize: 70, lineHeight: 74, fontFamily: fonts.numBold },
  numXl: { fontSize: 42, lineHeight: 48, fontFamily: fonts.numBold },
  numLg: { fontSize: 28, lineHeight: 34, fontFamily: fonts.numBold },
  numMd: { fontSize: 20, lineHeight: 26, fontFamily: fonts.num },
  numSm: { fontSize: 14, lineHeight: 20, fontFamily: fonts.num },
} as const satisfies Record<string, TextStyle>;

export type TextVariant = keyof typeof VARIANTS;
const MUTED: TextVariant[] = ['label', 'caption', 'small'];

interface TProps {
  variant?: TextVariant;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  selectable?: boolean;
  children: React.ReactNode;
}

/** 모든 글자는 이걸로. 변형(variant)이 크기 · 글꼴을 정한다 (도트 글꼴은 굵기를 글꼴 파일로 정한다) */
export const T = ({ variant = 'body', color, style, numberOfLines, selectable, children }: TProps) => {
  const theme = useTheme();
  const v: TextStyle = VARIANTS[variant];
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[
        { color: color ?? (MUTED.includes(variant) ? theme.muted : theme.ink), fontWeight: 'normal' },
        v,
        variant.startsWith('num') ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
};

// ── 하드웨어 부품 ─────────────────────────────────────────

// 키보드 포커스 표시용 표식. 실제 모양은 웹 전역 CSS(RootStyles)에 있다
export const focusProps: object = Platform.OS === 'web' ? { dataSet: { px: '1' } } : {};

interface HardBoxProps {
  /** 오른쪽 · 아래 두께(px). 버튼은 아래만, 패널은 둘 다 */
  dx?: number;
  dy?: number;
  /** 눌림: 두께만큼 내려가며 그림자가 사라진다 */
  pressed?: boolean;
  /** 두께 색 (기본: 외곽선) */
  shadow?: string;
  outerStyle?: StyleProp<ViewStyle>;
  faceStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/** 두께가 있는 면. 아래에 외곽선색 면을 깔고, 앞 면이 눌리면 그 위로 내려앉는다 */
export const HardBox = ({ dx = 0, dy = 4, pressed = false, shadow, outerStyle, faceStyle, children }: HardBoxProps) => {
  const theme = useTheme();
  return (
    <View style={[{ paddingRight: dx, paddingBottom: dy }, outerStyle]}>
      <View pointerEvents="none" style={{ position: 'absolute', left: dx, top: dy, right: 0, bottom: 0, backgroundColor: shadow ?? theme.outline }} />
      <View style={[{ borderWidth: OUTLINE, borderColor: theme.outline, transform: [{ translateX: pressed ? dx : 0 }, { translateY: pressed ? dy : 0 }] }, faceStyle]}>{children}</View>
    </View>
  );
};

// ── 화면 틀 ────────────────────────────────────────────

/** 상태바 영역을 비우고 바탕을 칠한다 (네비게이션 헤더는 쓰지 않는다). 웹은 오른쪽 위 앱 전환 버튼 자리를 비운다 */
export const Screen = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { backgroundColor: theme.paper, paddingTop: Platform.OS === 'web' ? 56 : insets.top + space(2) }]}>{children}</View>;
};

interface PageProps {
  children: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  scrollRef?: React.RefObject<ScrollView | null>;
  /** 아래에 고정 버튼(StickyFooter)이 있으면 그만큼 비운다 */
  footerSpace?: boolean;
}

/** 세로로 스크롤하는 본문. 넓은 화면에서도 한 열 560px */
export const Page = ({ children, refreshControl, scrollRef, footerSpace }: PageProps) => (
  <ScrollView
    ref={scrollRef}
    style={{ flex: 1 }}
    contentContainerStyle={[styles.page, footerSpace ? { paddingBottom: space(28) } : null]}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
    refreshControl={refreshControl}
  >
    {children}
  </ScrollView>
);

interface HeadingProps {
  title: string;
  /** 제목 위 한 줄 (날짜 등) */
  overline?: string;
  caption?: string;
  right?: React.ReactNode;
}

/** 탭 화면의 큰 제목 */
export const Heading = ({ title, overline, caption, right }: HeadingProps) => (
  <View style={{ gap: space(1), paddingTop: space(2), paddingBottom: space(1) }}>
    {overline ? <T variant="label">{overline}</T> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
      <T variant="title" style={{ flex: 1 }} numberOfLines={2}>
        {title}
      </T>
      {right}
    </View>
    {caption ? <T variant="caption">{caption}</T> : null}
  </View>
);

interface HeaderProps {
  title?: string;
  /** 왼쪽 버튼 글자 (‹ 뒤로 / 닫기) */
  back?: string;
  /** 돌아갈 곳이 없을 때(주소로 바로 연 경우) 갈 곳 */
  fallback?: string;
  right?: React.ReactNode;
}

/** 쌓인 화면의 윗줄: ‹ 돌아가기 · 제목 · 오른쪽 동작. 돌아가기는 두께 있는 작은 버튼 */
export const Header = ({ title, back = '뒤로', fallback = '/', right }: HeaderProps) => {
  const theme = useTheme();
  const [pressed, setPressed] = React.useState<boolean>(false);
  return (
    <View style={{ gap: space(3), paddingTop: space(1), paddingBottom: space(1) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))}
          onPressIn={() => setPressed(true)}
          onPressOut={() => setPressed(false)}
          accessibilityRole="button"
          accessibilityLabel={`${back}`}
          {...focusProps}
        >
          <HardBox dy={3} pressed={pressed} faceStyle={{ minHeight: 41, minWidth: 44, paddingHorizontal: space(3), backgroundColor: theme.face, flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
            <T variant="bodyStrong" style={{ fontSize: 20, lineHeight: 22 }}>
              ‹
            </T>
            <T variant="label" color={theme.ink}>
              {back}
            </T>
          </HardBox>
        </Pressable>
        {right}
      </View>
      {title ? <T variant="title">{title}</T> : null}
    </View>
  );
};

interface GroupProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 민트 몸체 면. 화면마다 한 곳, 그 화면의 주된 행동에만 */
  inverse?: boolean;
  /** 안쪽 여백 없이 (Row 목록을 담을 때) */
  flush?: boolean;
}

/** 묶음: 회녹색 LCD 패널(왼쪽 · 위 안쪽 그늘). inverse 는 민트 몸체(위 · 왼쪽 하이라이트) */
export const Group = ({ children, style, inverse, flush }: GroupProps) => {
  const theme = useTheme();
  const edge = inverse ? theme.mintLight : theme.sheetShade;
  return (
    <HardBox
      dx={4}
      dy={4}
      outerStyle={{ alignSelf: 'stretch' }}
      faceStyle={[
        {
          backgroundColor: inverse ? theme.mint : theme.sheet,
          borderRadius: radius.group,
          padding: flush ? 0 : space(5),
          paddingVertical: flush ? space(1) : space(5),
          gap: flush ? 0 : space(4),
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: 0, height: 3, backgroundColor: edge }} />
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: edge }} />
      {children}
    </HardBox>
  );
};

interface SectionProps {
  title: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}

/** 묶음 위 작은 제목(앞에 크림 칸 하나) + 오른쪽 링크 */
export const Section = ({ title, right, children }: SectionProps) => {
  const theme = useTheme();
  return (
    <View style={{ gap: space(3) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3), paddingHorizontal: space(1) }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
          <View style={{ width: 12, height: 12, backgroundColor: theme.cream, borderWidth: 3, borderColor: theme.outline, marginTop: 1 }} />
          <T variant="heading" style={{ flex: 1 }}>
            {title}
          </T>
        </View>
        {right}
      </View>
      {children}
    </View>
  );
};

interface RowProps {
  title: string;
  meta?: string;
  /** 왼쪽 기호 · 아이콘 */
  left?: React.ReactNode;
  /** 오른쪽 값 (숫자 등) */
  value?: React.ReactNode;
  onPress?: () => void;
  first?: boolean;
  accessibilityLabel?: string;
  /** 누르면 이동하는 줄이면 › 를 붙인다 (기본: onPress 가 있으면) */
  chevron?: boolean;
}

/** 묶음 안의 한 줄. 누르면 그 항목 화면으로 (눌리는 동안 크림색 칸 · 점선 구분) */
export const Row = ({ title, meta, left, value, onPress, first, accessibilityLabel, chevron }: RowProps) => {
  const theme = useTheme();
  const content = (
    <>
      {left ? <View style={{ width: 20, alignItems: 'center' }}>{left}</View> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <T variant="bodyStrong" numberOfLines={1}>
          {title}
        </T>
        {meta ? (
          <T variant="caption" numberOfLines={2}>
            {meta}
          </T>
        ) : null}
      </View>
      {value}
      {(chevron ?? !!onPress) ? (
        <T variant="heading" color={theme.ink}>
          ›
        </T>
      ) : null}
    </>
  );
  const rowStyle: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
    minHeight: 60,
    paddingVertical: space(3),
    paddingHorizontal: space(5),
    borderTopWidth: first ? 0 : 2,
    borderTopColor: theme.line,
    borderStyle: 'dotted',
  };
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      {...focusProps}
      style={({ pressed }) => [rowStyle, { backgroundColor: pressed ? theme.cream : 'transparent' }]}
    >
      {content}
    </Pressable>
  );
};

interface MessageProps {
  text: string;
  tone?: 'error' | 'muted' | 'ok';
}

/** 오류는 붉은 글자 상자, 완료 알림은 LCD 상자, 나머지는 회색 글자 한 줄 */
export const Message = ({ text, tone = 'muted' }: MessageProps) => {
  const theme = useTheme();
  if (!text) return null;
  if (tone === 'muted') return <T variant="caption">{text}</T>;
  const error = tone === 'error';
  return (
    <View
      accessibilityLiveRegion="polite"
      accessibilityRole={error ? 'alert' : undefined}
      style={{ backgroundColor: error ? theme.dangerSoft : theme.sheet, borderWidth: OUTLINE, borderColor: error ? theme.danger : theme.outline, paddingHorizontal: space(4), paddingVertical: space(3) }}
    >
      <T variant="bodyStrong" color={error ? theme.danger : theme.ink} style={{ fontSize: 14, lineHeight: 20 }}>
        {text}
      </T>
    </View>
  );
};

// ── 입력 ───────────────────────────────────────────────

interface FieldProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** 상자 안 오른쪽에 붙는 단위 */
  unit?: string;
  hint?: string;
  secureTextEntry?: boolean;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: 'none' | 'sentences';
  multiline?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** 입력 상자 바탕: 안쪽 위 · 왼쪽 그늘이 있는 투입구 모양 */
const inputBox = (theme: ReturnType<typeof useTheme>, focused: boolean, invalid: boolean, multiline: boolean): ViewStyle => ({
  flexDirection: 'row',
  alignItems: multiline ? 'flex-start' : 'center',
  minHeight: 52,
  backgroundColor: theme.field,
  borderRadius: radius.box,
  borderWidth: OUTLINE,
  // 포커스는 빨강(켜짐), 오류는 붉은 글자색. 평소에는 3:1 이상 대비의 테두리
  borderColor: invalid ? theme.danger : focused ? theme.led : theme.border,
  paddingHorizontal: space(3),
});

/** 글자 입력 상자 (이름 · 메모 등). 숫자는 NumberInput */
export const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  unit,
  hint,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  multiline = false,
  invalid = false,
  autoFocus,
  onSubmitEditing,
  style,
}: FieldProps) => {
  const theme = useTheme();
  const [focused, setFocused] = React.useState<boolean>(false);
  return (
    <View style={[{ gap: space(1.5), minWidth: 0 }, style]}>
      {label ? <T variant="label" color={theme.ink}>{label}</T> : null}
      <View style={inputBox(theme, focused, invalid, multiline)}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.muted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            {
              flex: 1,
              minWidth: 0,
              color: theme.ink,
              fontSize: 16, // 16px 미만이면 iOS 웹이 확대한다
              fontFamily: fonts.px,
              paddingVertical: space(3),
              minHeight: multiline ? 96 : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            { outlineWidth: 0 },
          ]}
        />
        {unit ? <T variant="label" color={theme.ink} style={{ marginLeft: space(1) }}>{unit}</T> : null}
      </View>
      {hint ? <T variant="small" style={{ fontFamily: fonts.px }}>{hint}</T> : null}
    </View>
  );
};

interface NumberInputProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  unit?: string;
  placeholder?: string;
  /** 28:30 처럼 숫자 키패드로 못 넣는 값은 false */
  decimal?: boolean;
  size?: 'large' | 'medium';
  invalid?: boolean;
  hint?: string;
  style?: StyleProp<ViewStyle>;
}

/** LCD 창에 뜬 큰 숫자 하나. 거리 · 시간 · 체중처럼 그 화면의 핵심 숫자를 받는다 */
export const NumberInput = ({ label, value, onChangeText, unit, placeholder, decimal = true, size = 'large', invalid, hint, style }: NumberInputProps) => {
  const theme = useTheme();
  const [focused, setFocused] = React.useState<boolean>(false);
  const large = size === 'large';
  return (
    <View style={[{ gap: space(1.5), minWidth: 0 }, style]}>
      <T variant="label" color={theme.ink}>{label}</T>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: space(1.5),
          paddingHorizontal: space(3),
          backgroundColor: theme.sheet,
          borderWidth: OUTLINE,
          borderColor: invalid ? theme.danger : focused ? theme.led : theme.outline,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.line}
          keyboardType={decimal ? 'decimal-pad' : 'numbers-and-punctuation'}
          accessibilityLabel={unit ? `${label} (${unit})` : label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            {
              flex: 1,
              minWidth: 0,
              color: theme.ink,
              fontFamily: fonts.numBold,
              fontSize: large ? 42 : 28,
              lineHeight: large ? 52 : 36,
              paddingVertical: space(1),
              fontVariant: ['tabular-nums'],
            },
            { outlineWidth: 0 },
          ]}
        />
        {unit ? <T variant="label" color={theme.ink} style={{ paddingBottom: space(2) }}>{unit}</T> : null}
      </View>
      {hint ? <T variant="small" color={invalid ? theme.danger : theme.muted} style={{ fontFamily: fonts.px }}>{hint}</T> : null}
    </View>
  );
};

interface StepperProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  /** 무게처럼 0.5 단위로 바뀌는 값 */
  step?: number;
  unit?: string;
  placeholder?: string;
}

/** 원형 키: 주황 몸통 + 아래 두께. 누르면 내려앉는다 */
export const RoundKey = ({ size = 44, selected, onPress, accessibilityLabel, children }: { size?: number; selected?: boolean; onPress: () => void; accessibilityLabel: string; children?: React.ReactNode }) => {
  const theme = useTheme();
  const [pressed, setPressed] = React.useState<boolean>(false);
  const depth = 3;
  const body = selected ? theme.cream : theme.key;
  const shade = selected ? theme.creamShade : theme.keyShade;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: !!selected }}
      {...focusProps}
      style={{ width: size, height: size + depth, borderRadius: size }}
    >
      <View style={{ position: 'absolute', top: depth, left: 0, width: size, height: size, borderRadius: size, backgroundColor: theme.outline }} />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size,
          borderWidth: OUTLINE,
          borderColor: theme.outline,
          backgroundColor: body,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          transform: [{ translateY: pressed ? depth : 0 }],
        }}
      >
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 6, backgroundColor: shade }} />
        {children}
      </View>
    </Pressable>
  );
};

/** − 숫자 + . 횟수 · 세트 · 무게처럼 조금씩 바꾸는 값. 가운데 숫자는 직접 고칠 수도 있다 */
export const Stepper = ({ label, value, onChange, min = 0, step = 1, unit, placeholder }: StepperProps) => {
  const theme = useTheme();
  const n = Number(value.replace(',', '.'));
  const current = Number.isFinite(n) && value.trim() !== '' ? n : NaN;
  const move = (d: number): void => {
    const base = Number.isNaN(current) ? (d > 0 ? min : min + step) : current;
    const next = Math.max(min, Math.round((base + d * step) * 100) / 100);
    onChange(String(next));
  };
  const btn = (d: number, glyph: string, a11y: string) => (
    <RoundKey onPress={() => move(d)} accessibilityLabel={a11y}>
      <T variant="heading" color={theme.outline} style={{ fontSize: 24, lineHeight: 26 }}>
        {glyph}
      </T>
    </RoundKey>
  );
  return (
    <View style={{ gap: space(1.5), minWidth: 0, flex: 1 }}>
      <T variant="small" color={theme.ink}>{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
        {btn(-1, '−', `${label} 줄이기`)}
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2, backgroundColor: theme.sheet, borderWidth: OUTLINE, borderColor: theme.outline, paddingVertical: 2 }}>
          <TextInput
            value={value}
            onChangeText={(v) => onChange(v.replace(/[^0-9.,]/g, ''))}
            keyboardType="decimal-pad"
            placeholder={placeholder}
            placeholderTextColor={theme.line}
            accessibilityLabel={label}
            style={[
              { minWidth: 28, maxWidth: '100%', textAlign: 'center', color: theme.ink, fontSize: 28, lineHeight: 34, fontFamily: fonts.numBold, paddingVertical: 0 },
              { outlineWidth: 0 },
            ]}
          />
          {unit ? <T variant="small" color={theme.ink}>{unit}</T> : null}
        </View>
        {btn(1, '+', `${label} 늘리기`)}
      </View>
    </View>
  );
};

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** 이 날보다 뒤로는 못 간다 (기록은 미래 날짜가 없다) */
  max?: string;
}

/** ‹ 11월 6일 (목) › — 작은 두께 버튼 둘. 오늘이 아니면 '오늘로' */
export const DatePicker = ({ value, onChange, max }: DatePickerProps) => {
  const theme = useTheme();
  const today = todayString();
  const canNext = !max || value < max;
  const arrow = (d: number, glyph: string, a11y: string, enabled: boolean) => (
    <SmallKey glyph={glyph} onPress={() => enabled && onChange(addDays(value, d))} disabled={!enabled} accessibilityLabel={a11y} />
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
      {arrow(-1, '‹', '하루 전', true)}
      <T variant="bodyStrong" style={{ minWidth: 112, textAlign: 'center' }}>
        {formatLongDate(value)}
      </T>
      {arrow(1, '›', '하루 뒤', canNext)}
      {value !== today ? (
        <Pressable onPress={() => onChange(today)} accessibilityRole="button" hitSlop={6} {...focusProps} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1, minHeight: 44, justifyContent: 'center' })}>
          <T variant="label" color={theme.ink} style={{ textDecorationLine: 'underline' }}>
            오늘로
          </T>
        </Pressable>
      ) : null}
    </View>
  );
};

const SmallKey = ({ glyph, onPress, disabled, accessibilityLabel }: { glyph: string; onPress: () => void; disabled?: boolean; accessibilityLabel: string }) => {
  const theme = useTheme();
  const [pressed, setPressed] = React.useState<boolean>(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !!disabled }}
      {...focusProps}
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <HardBox dy={3} pressed={pressed && !disabled} faceStyle={{ width: 44, height: 41, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.face }}>
        <T variant="heading">{glyph}</T>
      </HardBox>
    </Pressable>
  );
};

// ── 버튼 ───────────────────────────────────────────────

interface ButtonProps {
  title: string;
  onPress: () => void;
  /** primary · inverse = 크림 면, secondary = 기본 면 */
  variant?: 'primary' | 'secondary' | 'inverse';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** 두께 4px. 누르면 내려앉고 그림자가 사라진다. 비활성은 줄무늬 느낌으로 흐리게 */
export const Button = ({ title, onPress, variant = 'primary', disabled = false, style }: ButtonProps) => {
  const theme = useTheme();
  const [pressed, setPressed] = React.useState<boolean>(false);
  const fill = variant === 'secondary' ? theme.face : theme.cream;
  const color = variant === 'secondary' ? theme.ink : theme.onCream;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      {...focusProps}
      style={[{ opacity: disabled ? 0.55 : 1 }, style]}
    >
      <HardBox
        dy={4}
        pressed={pressed && !disabled}
        faceStyle={{ minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space(5), backgroundColor: fill, borderRadius: radius.box }}
      >
        <T variant="bodyStrong" color={color} style={{ fontSize: 17 }}>
          {title}
        </T>
      </HardBox>
    </Pressable>
  );
};

interface TextButtonProps {
  title: string;
  onPress: () => void;
  tone?: 'default' | 'muted' | 'danger';
  disabled?: boolean;
  color?: string;
}

/** 글자 버튼 (보조 동작) */
export const TextButton = ({ title, onPress, tone = 'default', disabled = false, color }: TextButtonProps) => {
  const theme = useTheme();
  const c = color ?? (tone === 'danger' ? theme.danger : tone === 'muted' ? theme.muted : theme.ink);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      {...focusProps}
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.5 : 1, paddingVertical: space(2), minHeight: 44, justifyContent: 'center' })}
    >
      <T variant="label" color={c} style={{ fontSize: 15, textDecorationLine: 'underline' }}>
        {title}
      </T>
    </Pressable>
  );
};

/** 화면 아래 고정 영역 (저장 버튼): 민트 몸체 띠. Page 에 footerSpace 를 함께 준다 */
export const StickyFooter = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: theme.mint,
        borderTopWidth: OUTLINE,
        borderTopColor: theme.outline,
        paddingTop: space(3),
        paddingBottom: insets.bottom + space(3),
        paddingHorizontal: layout.gutter,
      }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: theme.mintLight }} />
      <View style={{ width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', gap: space(2) }}>{children}</View>
    </View>
  );
};

// ── 고르기 ─────────────────────────────────────────────

interface SegmentedProps<V extends string> {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}

/** 화면 안의 보기 전환. 고른 칸은 크림색 + 빨간 불 */
export const Segmented = <V extends string>({ options, value, onChange }: SegmentedProps<V>) => {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderWidth: OUTLINE, borderColor: theme.outline, backgroundColor: theme.face }}>
      {options.map((option, i) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            {...focusProps}
            style={{
              flex: 1,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              flexDirection: 'row',
              gap: space(1.5),
              paddingHorizontal: space(1),
              borderLeftWidth: i === 0 ? 0 : OUTLINE,
              borderLeftColor: theme.outline,
              backgroundColor: selected ? theme.cream : 'transparent',
            }}
          >
            {selected ? <View style={{ width: 6, height: 6, backgroundColor: theme.led }} /> : null}
            <T variant="label" color={selected ? theme.onCream : theme.ink} numberOfLines={1} style={{ flexShrink: 1, fontSize: 13 }}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
};

interface ChipProps {
  label: string;
  selected?: boolean;
  onPress: () => void;
  left?: React.ReactNode;
}

/** 고르기 칩: 두께 있는 작은 버튼. 고른 칩은 크림색 + 눌린 채로 */
export const Chip = ({ label, selected = false, onPress, left }: ChipProps) => {
  const theme = useTheme();
  const [pressed, setPressed] = React.useState<boolean>(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      {...focusProps}
    >
      <HardBox
        dy={3}
        pressed={pressed || selected}
        faceStyle={{ minHeight: 41, paddingHorizontal: space(4), flexDirection: 'row', alignItems: 'center', gap: space(2), backgroundColor: selected ? theme.cream : theme.face }}
      >
        {left}
        <T variant="label" color={selected ? theme.onCream : theme.ink} style={{ fontSize: 15 }}>
          {label}
        </T>
      </HardBox>
    </Pressable>
  );
};

interface KindChipsProps<V extends WorkoutKind | PlanKind> {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
}

/** 운동 종류 고르기: 기호 + 이름 칩 */
export const KindChips = <V extends WorkoutKind | PlanKind>({ options, value, onChange }: KindChipsProps<V>) => {
  const theme = useTheme();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2.5), paddingBottom: 3 }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Chip
            key={o.value}
            label={o.label}
            selected={selected}
            onPress={() => onChange(o.value)}
            left={<KindMark kind={o.value} size={9} color={selected ? theme.onCream : theme.ink} />}
          />
        );
      })}
    </View>
  );
};

// ── 숫자 ───────────────────────────────────────────────

interface StatProps {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}

/** 큰 숫자 하나 + 이름. 여러 개를 가로로 나란히 놓는다 */
export const Stat = ({ label, value, unit, sub }: StatProps) => (
  <View style={{ flexBasis: '30%', flexGrow: 1, minWidth: 96, gap: 2 }}>
    <T variant="small">{label}</T>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
      <T variant="numLg">{value}</T>
      {unit ? <T variant="small">{unit}</T> : null}
    </View>
    {sub ? <T variant="small" style={{ fontFamily: fonts.px }}>{sub}</T> : null}
  </View>
);

interface ProgressBarProps {
  value: number; // 0~1 (넘으면 꽉 채운다)
  marker?: number; // 0~1, 기준선 (예: 오늘까지의 목표)
  muted?: boolean;
}

const CELLS = 20;

/** 칸으로 채우는 막대 (20칸). 기준선은 빨간 표식 */
export const ProgressBar = ({ value, marker, muted }: ProgressBarProps) => {
  const theme = useTheme();
  const clamp = (n: number): number => Math.max(0, Math.min(1, n));
  const filled = value > 0 ? Math.max(1, Math.round(clamp(value) * CELLS)) : 0;
  const markCell = marker !== undefined && marker > 0 && marker < 1 ? Math.min(CELLS - 1, Math.round(clamp(marker) * CELLS)) : -1;
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamp(value) * 100) }}
      style={{ flexDirection: 'row', gap: 2, padding: 3, borderWidth: OUTLINE, borderColor: theme.outline, backgroundColor: theme.paper }}
    >
      {Array.from({ length: CELLS }, (_, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: 12,
            backgroundColor: i < filled ? (muted ? theme.muted : theme.petInk) : theme.sheetShade,
            borderBottomWidth: i === markCell ? 3 : 0,
            borderBottomColor: theme.led,
          }}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  page: { gap: space(6), paddingBottom: space(12), paddingRight: 4, width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center' },
});
