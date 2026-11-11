import React from 'react';
import {
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
import { fonts, layout, radius, space, useTheme } from '@/theme';
import type { PlanKind, WorkoutKind } from '@/types';

// ── 글자 ───────────────────────────────────────────────
// 크기 단계: 12 · 14 · 16 · 20 · 28 · 44 · 72. 숫자는 좁은 숫자체

const VARIANTS = {
  title: { fontSize: 28, lineHeight: 34, fontWeight: '800', letterSpacing: -0.6 },
  heading: { fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -0.3 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  caption: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  small: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  numHero: { fontSize: 72, lineHeight: 72, fontFamily: fonts.numBold, letterSpacing: -1 },
  numXl: { fontSize: 44, lineHeight: 48, fontFamily: fonts.numBold },
  numLg: { fontSize: 28, lineHeight: 32, fontFamily: fonts.numBold },
  numMd: { fontSize: 20, lineHeight: 24, fontFamily: fonts.num },
  numSm: { fontSize: 16, lineHeight: 20, fontFamily: fonts.num },
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

/** 모든 글자는 이걸로. 변형(variant)이 크기 · 굵기 · 글꼴을 정한다 */
export const T = ({ variant = 'body', color, style, numberOfLines, selectable, children }: TProps) => {
  const theme = useTheme();
  const v: TextStyle = VARIANTS[variant];
  return (
    <Text
      numberOfLines={numberOfLines}
      selectable={selectable}
      style={[
        { fontFamily: v.fontFamily ?? fonts.sans, color: color ?? (MUTED.includes(variant) ? theme.muted : theme.ink) },
        v,
        v.fontFamily ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}
    >
      {children}
    </Text>
  );
};

// ── 화면 틀 ────────────────────────────────────────────

/** 상태바 영역을 비우고 바탕을 칠한다 (네비게이션 헤더는 쓰지 않는다) */
export const Screen = ({ children }: { children: React.ReactNode }) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { backgroundColor: theme.paper, paddingTop: insets.top + space(2) }]}>{children}</View>;
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
  <View style={{ gap: space(1), paddingTop: space(3), paddingBottom: space(1) }}>
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

/** 쌓인 화면의 윗줄: ‹ 돌아가기 · 제목 · 오른쪽 동작 */
export const Header = ({ title, back = '뒤로', fallback = '/', right }: HeaderProps) => {
  const theme = useTheme();
  return (
    <View style={{ gap: space(2), paddingTop: space(1), paddingBottom: space(1) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))}
          accessibilityRole="button"
          accessibilityLabel={`${back}`}
          hitSlop={10}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space(1), opacity: pressed ? 0.5 : 1 })}
        >
          <T variant="heading" color={theme.muted} style={{ fontSize: 24, lineHeight: 26, fontWeight: '400' }}>
            ‹
          </T>
          <T variant="bodyStrong" color={theme.muted}>
            {back}
          </T>
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
  /** 반전 면 (검은 바탕). 화면마다 한 곳에만 */
  inverse?: boolean;
  /** 안쪽 여백 없이 (Row 목록을 담을 때) */
  flush?: boolean;
}

/** 묶음: 선 대신 옅은 회색 면으로 나눈다 */
export const Group = ({ children, style, inverse, flush }: GroupProps) => {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: inverse ? theme.ink : theme.sheet,
          borderRadius: radius.group,
          padding: flush ? 0 : space(5),
          paddingVertical: flush ? space(1) : space(5),
          gap: flush ? 0 : space(4),
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
};

interface SectionProps {
  title: string;
  right?: React.ReactNode;
  children?: React.ReactNode;
}

/** 묶음 위 작은 제목 + 오른쪽 링크 */
export const Section = ({ title, right, children }: SectionProps) => (
  <View style={{ gap: space(2.5) }}>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space(3), paddingHorizontal: space(1) }}>
      <T variant="heading" style={{ flex: 1 }}>
        {title}
      </T>
      {right}
    </View>
    {children}
  </View>
);

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

/** 묶음 안의 한 줄. 누르면 그 항목 화면으로 */
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
        <T variant="heading" color={theme.muted} style={{ fontWeight: '400' }}>
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
    borderTopWidth: first ? 0 : 1,
    borderTopColor: theme.line,
  };
  if (!onPress) return <View style={rowStyle}>{content}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.55 : 1 }]}
    >
      {content}
    </Pressable>
  );
};

interface MessageProps {
  text: string;
  tone?: 'error' | 'muted' | 'ok';
}

/** 오류는 붉은 글자 상자, 완료 알림은 회색 상자, 나머지는 회색 글자 한 줄 */
export const Message = ({ text, tone = 'muted' }: MessageProps) => {
  const theme = useTheme();
  if (!text) return null;
  if (tone === 'muted') return <T variant="caption">{text}</T>;
  const error = tone === 'error';
  return (
    <View
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: error ? theme.dangerSoft : theme.sheet, borderRadius: radius.box, paddingHorizontal: space(4), paddingVertical: space(3) }}
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
      {label ? <T variant="label">{label}</T> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: 52,
          backgroundColor: theme.paper,
          borderRadius: radius.box,
          borderWidth: focused || invalid ? 2 : 1,
          borderColor: invalid ? theme.danger : focused ? theme.ink : theme.border,
          // 테두리가 두꺼워져도 글자가 움직이지 않게 안쪽 여백으로 메운다
          paddingHorizontal: space(4) - (focused || invalid ? 1 : 0),
        }}
      >
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
              fontFamily: fonts.sans,
              paddingVertical: space(3),
              minHeight: multiline ? 96 : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
            },
            { outlineWidth: 0 },
          ]}
        />
        {unit ? <T variant="label" style={{ marginLeft: space(1) }}>{unit}</T> : null}
      </View>
      {hint ? <T variant="small" style={{ fontWeight: '400' }}>{hint}</T> : null}
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

/** 밑줄 위 큰 숫자 하나. 거리 · 시간 · 체중처럼 그 화면의 핵심 숫자를 받는다 */
export const NumberInput = ({ label, value, onChangeText, unit, placeholder, decimal = true, size = 'large', invalid, hint, style }: NumberInputProps) => {
  const theme = useTheme();
  const [focused, setFocused] = React.useState<boolean>(false);
  const large = size === 'large';
  return (
    <View style={[{ gap: space(1), minWidth: 0 }, style]}>
      <T variant="label">{label}</T>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          gap: space(1.5),
          borderBottomWidth: 2,
          borderBottomColor: invalid ? theme.danger : focused ? theme.ink : theme.border,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.border}
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
              fontSize: large ? 44 : 28,
              lineHeight: large ? 52 : 34,
              paddingVertical: space(1),
              fontVariant: ['tabular-nums'],
            },
            { outlineWidth: 0 },
          ]}
        />
        {unit ? <T variant="label" style={{ paddingBottom: space(2) }}>{unit}</T> : null}
      </View>
      {hint ? <T variant="small" color={invalid ? theme.danger : theme.muted} style={{ fontWeight: '400' }}>{hint}</T> : null}
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
    <Pressable
      onPress={() => move(d)}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius.pill,
        backgroundColor: theme.paper,
        borderWidth: 1,
        borderColor: theme.border,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <T variant="heading" style={{ fontWeight: '500' }}>
        {glyph}
      </T>
    </Pressable>
  );
  return (
    <View style={{ gap: space(1.5), minWidth: 0, flex: 1 }}>
      <T variant="small">{label}</T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
        {btn(-1, '−', `${label} 줄이기`)}
        <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 2 }}>
          <TextInput
            value={value}
            onChangeText={(v) => onChange(v.replace(/[^0-9.,]/g, ''))}
            keyboardType="decimal-pad"
            placeholder={placeholder}
            placeholderTextColor={theme.border}
            accessibilityLabel={label}
            style={[
              { minWidth: 28, maxWidth: '100%', textAlign: 'center', color: theme.ink, fontSize: 24, fontFamily: fonts.numBold, paddingVertical: 0 },
              { outlineWidth: 0 },
            ]}
          />
          {unit ? <T variant="small">{unit}</T> : null}
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

/** ‹ 11월 6일 (목) › — 작게. 오늘이 아니면 '오늘로' */
export const DatePicker = ({ value, onChange, max }: DatePickerProps) => {
  const theme = useTheme();
  const today = todayString();
  const canNext = !max || value < max;
  const arrow = (d: number, glyph: string, a11y: string, enabled: boolean) => (
    <Pressable
      onPress={() => enabled && onChange(addDays(value, d))}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={6}
      style={({ pressed }) => ({ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: !enabled ? 0.25 : pressed ? 0.5 : 1 })}
    >
      <T variant="heading" style={{ fontWeight: '400' }}>
        {glyph}
      </T>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(1) }}>
      {arrow(-1, '‹', '하루 전', true)}
      <T variant="bodyStrong" style={{ minWidth: 112, textAlign: 'center' }}>
        {formatLongDate(value)}
      </T>
      {arrow(1, '›', '하루 뒤', canNext)}
      {value !== today ? (
        <Pressable onPress={() => onChange(today)} accessibilityRole="button" hitSlop={6} style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
          <T variant="label" color={theme.ink} style={{ textDecorationLine: 'underline' }}>
            오늘로
          </T>
        </Pressable>
      ) : null}
    </View>
  );
};

// ── 버튼 ───────────────────────────────────────────────

interface ButtonProps {
  title: string;
  onPress: () => void;
  /** primary = 검은 면, secondary = 테두리, inverse = 검은 면 위에 놓는 흰 버튼 */
  variant?: 'primary' | 'secondary' | 'inverse';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Button = ({ title, onPress, variant = 'primary', disabled = false, style }: ButtonProps) => {
  const theme = useTheme();
  const fill = variant === 'primary' ? theme.ink : variant === 'inverse' ? theme.onInk : 'transparent';
  const color = variant === 'primary' ? theme.onInk : variant === 'inverse' ? theme.ink : theme.ink;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        {
          height: 56,
          borderRadius: radius.box,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: space(5),
          backgroundColor: fill,
          borderWidth: variant === 'secondary' ? 1.5 : 0,
          borderColor: theme.ink,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}
    >
      <T variant="bodyStrong" color={color} style={{ fontSize: 17, fontWeight: '700' }}>
        {title}
      </T>
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
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.5 : 1, paddingVertical: space(2), minHeight: 40, justifyContent: 'center' })}
    >
      <T variant="label" color={c} style={{ fontSize: 15 }}>
        {title}
      </T>
    </Pressable>
  );
};

/** 화면 아래 고정 영역 (저장 버튼). Page 에 footerSpace 를 함께 준다 */
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
        backgroundColor: theme.paper,
        borderTopWidth: 1,
        borderTopColor: theme.line,
        paddingTop: space(3),
        paddingBottom: insets.bottom + space(3),
        paddingHorizontal: layout.gutter,
      }}
    >
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

/** 화면 안의 보기 전환. 고른 칸만 검게 */
export const Segmented = <V extends string>({ options, value, onChange }: SegmentedProps<V>) => {
  const theme = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', padding: 3, borderRadius: radius.pill, backgroundColor: theme.sheet }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              height: 36,
              borderRadius: radius.pill,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: space(3),
              backgroundColor: selected ? theme.ink : 'transparent',
            }}
          >
            <T variant="label" color={selected ? theme.onInk : theme.muted}>
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

/** 고르기 칩. 고른 칩은 검게 */
export const Chip = ({ label, selected = false, onPress, left }: ChipProps) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        height: 40,
        paddingHorizontal: space(4),
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space(2),
        borderWidth: 1,
        borderColor: selected ? theme.ink : theme.border,
        backgroundColor: selected ? theme.ink : theme.paper,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {left}
      <T variant="label" color={selected ? theme.onInk : theme.ink} style={{ fontSize: 15 }}>
        {label}
      </T>
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
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Chip
            key={o.value}
            label={o.label}
            selected={selected}
            onPress={() => onChange(o.value)}
            left={<KindMark kind={o.value} size={9} color={selected ? theme.onInk : theme.ink} />}
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
    {sub ? <T variant="small" style={{ fontWeight: '400' }}>{sub}</T> : null}
  </View>
);

interface ProgressBarProps {
  value: number; // 0~1 (넘으면 꽉 채운다)
  marker?: number; // 0~1, 기준선 (예: 오늘까지의 목표)
  muted?: boolean;
}

export const ProgressBar = ({ value, marker, muted }: ProgressBarProps) => {
  const theme = useTheme();
  const clamp = (n: number): number => Math.max(0, Math.min(1, n));
  return (
    <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: theme.line, position: 'relative' }}>
      <View style={{ width: `${clamp(value) * 100}%`, height: '100%', borderRadius: radius.pill, backgroundColor: muted ? theme.muted : theme.ink }} />
      {marker !== undefined && marker > 0 && marker < 1 ? (
        <View style={{ position: 'absolute', left: `${clamp(marker) * 100}%`, top: -5, bottom: -5, width: 2, marginLeft: -1, backgroundColor: theme.ink }} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: layout.gutter },
  page: { gap: space(6), paddingBottom: space(12), width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center' },
});
