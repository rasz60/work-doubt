import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type RefreshControlProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { addDays, formatLongDate, todayString } from '@/lib/date';
import { fonts, kindColors, radius, space, useTheme } from '@/theme';
import type { PlanKind, WorkoutKind } from '@/types';

// ── 글자 ───────────────────────────────────────────────

const VARIANTS = {
  title: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.5 },
  heading: { fontSize: 18, lineHeight: 24, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, lineHeight: 22, fontWeight: '400' },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: '600' },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: '400' },
  small: { fontSize: 12, lineHeight: 16, fontWeight: '600' },
  // 숫자: 전광판 숫자체. 단위는 옆에 caption 으로
  numXl: { fontSize: 52, lineHeight: 54, fontFamily: fonts.numBold },
  numLg: { fontSize: 34, lineHeight: 38, fontFamily: fonts.numBold },
  numMd: { fontSize: 24, lineHeight: 28, fontFamily: fonts.num },
  numSm: { fontSize: 18, lineHeight: 22, fontFamily: fonts.num },
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
        { fontFamily: v.fontFamily ?? fonts.sans, color: color ?? (MUTED.includes(variant) ? theme.textMuted : theme.text) },
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

interface ScreenProps {
  children: React.ReactNode;
}

// 네비게이션 헤더를 쓰지 않으므로 상태바 영역은 Screen 이 직접 비운다.
export const Screen = ({ children }: ScreenProps) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top + space(3) }]}>{children}</View>;
};

interface PageProps {
  children: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  scrollRef?: React.RefObject<ScrollView | null>;
}

/** 세로로 스크롤하는 본문. 넓은 화면에서도 한 줄 길이가 길어지지 않게 가운데 640px */
export const Page = ({ children, refreshControl, scrollRef }: PageProps) => (
  <ScrollView
    ref={scrollRef}
    contentContainerStyle={styles.page}
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

export const Heading = ({ title, overline, caption, right }: HeadingProps) => (
  <View style={{ gap: space(1), paddingTop: space(2), paddingBottom: space(1) }}>
    {overline ? <T variant="label">{overline}</T> : null}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(3) }}>
      <T variant="title" style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </T>
      {right}
    </View>
    {caption ? <T variant="caption">{caption}</T> : null}
  </View>
);

interface CardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 왼쪽에 종류 색 띠 */
  kind?: WorkoutKind | PlanKind;
}

/** 흰 카드. 그림자 없이 판(회색) 위에 놓인 면으로만 구분한다 */
export const Card = ({ children, style, kind }: CardProps) => {
  const theme = useTheme();
  return (
    <View
      style={[
        { backgroundColor: theme.surface, borderRadius: radius.card, padding: space(4), gap: space(3), overflow: 'hidden' },
        kind ? { borderLeftWidth: 4, borderLeftColor: kindColors(theme, kind).solid } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
};

interface SectionTitleProps {
  title: string;
  caption?: string;
  right?: React.ReactNode;
}

export const SectionTitle = ({ title, caption, right }: SectionTitleProps) => (
  <View style={{ gap: space(1) }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(3) }}>
      <T variant="heading" style={{ flex: 1 }}>
        {title}
      </T>
      {right}
    </View>
    {caption ? <T variant="caption">{caption}</T> : null}
  </View>
);

export const Divider = () => {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.line }} />;
};

interface MessageProps {
  text: string;
  tone?: 'error' | 'muted' | 'ok';
}

/** 오류는 붉은 상자, 완료 알림은 옅은 상자, 나머지는 회색 글자 한 줄 */
export const Message = ({ text, tone = 'muted' }: MessageProps) => {
  const theme = useTheme();
  if (!text) return null;
  if (tone === 'muted') return <T variant="caption">{text}</T>;
  const error = tone === 'error';
  return (
    <View style={{ backgroundColor: error ? theme.dangerSoft : theme.rest.soft, borderRadius: radius.box, paddingHorizontal: space(3), paddingVertical: space(2.5) }}>
      <T variant="bodyStrong" color={error ? theme.danger : theme.text} style={{ fontSize: 14, lineHeight: 20 }}>
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
  /** 상자 안 오른쪽에 붙는 단위 (km, kg …) */
  unit?: string;
  hint?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'decimal-pad' | 'number-pad';
  autoCapitalize?: 'none' | 'sentences';
  multiline?: boolean;
  /** 표 안처럼 좁은 곳: 높이를 줄이고 가운데 정렬 */
  compact?: boolean;
  invalid?: boolean;
  /** 28:30 처럼 숫자지만 일반 키보드가 필요한 칸도 숫자 글꼴로 */
  digits?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<ViewStyle>;
}

/** 테두리 있는 입력 상자. 라벨은 위, 단위는 상자 안 오른쪽 */
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
  compact = false,
  invalid = false,
  digits = false,
  onFocus,
  onBlur,
  style,
}: FieldProps) => {
  const theme = useTheme();
  const [focused, setFocused] = React.useState<boolean>(false);
  const numeric = digits || keyboardType === 'decimal-pad' || keyboardType === 'number-pad';

  return (
    <View style={[{ gap: space(1.5), minWidth: 0 }, style]}>
      {label ? <T variant="label">{label}</T> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          minHeight: compact ? 42 : 50,
          backgroundColor: theme.field,
          borderRadius: radius.box,
          borderWidth: focused || invalid ? 2 : 1,
          borderColor: invalid ? theme.danger : focused ? theme.text : theme.fieldBorder,
          // 테두리가 두꺼워져도 글자가 움직이지 않게 안쪽 여백으로 메운다
          paddingHorizontal: (compact ? space(2) : space(3.5)) - (focused || invalid ? 1 : 0),
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          multiline={multiline}
          onFocus={() => {
            setFocused(true);
            onFocus?.();
          }}
          onBlur={() => {
            setFocused(false);
            onBlur?.();
          }}
          style={[
            {
              flex: 1,
              minWidth: 0,
              color: theme.text,
              fontSize: 16, // 16px 미만이면 iOS 웹이 확대한다
              fontFamily: numeric ? fonts.num : fonts.sans,
              paddingVertical: compact ? space(2) : space(3),
              minHeight: multiline ? 88 : undefined,
              textAlignVertical: multiline ? 'top' : 'center',
              textAlign: compact && keyboardType !== 'default' ? 'center' : 'left',
            },
            numeric ? { fontSize: compact ? 20 : 22 } : null,
            // 웹 기본 포커스 테두리는 상자 테두리가 대신한다
            { outlineWidth: 0 },
          ]}
        />
        {unit ? <T variant="label" style={{ marginLeft: space(1) }}>{unit}</T> : null}
      </View>
      {hint ? <T variant="small" style={{ fontWeight: '400' }}>{hint}</T> : null}
    </View>
  );
};

interface StepperProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  label?: string;
  placeholder?: string;
}

/** − 숫자 + . 횟수 · 세트처럼 1씩 바꾸는 값. 가운데 숫자는 직접 고칠 수도 있다 */
export const Stepper = ({ value, onChange, min = 0, label, placeholder }: StepperProps) => {
  const theme = useTheme();
  const n = Number(value);
  const current = Number.isFinite(n) && value.trim() !== '' ? n : NaN;
  const step = (d: number): void => {
    const base = Number.isNaN(current) ? (d > 0 ? min : min + 1) : current;
    onChange(String(Math.max(min, base + d)));
  };
  const btn = (d: number, glyph: string, a11y: string) => (
    <Pressable
      onPress={() => step(d)}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={4}
      style={({ pressed }) => ({ width: 30, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
    >
      <T variant="heading" color={theme.textMuted} style={{ fontWeight: '500' }}>
        {glyph}
      </T>
    </Pressable>
  );
  return (
    <View style={{ gap: space(1.5), minWidth: 0, flex: 1 }}>
      {label ? <T variant="label">{label}</T> : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          height: 42,
          backgroundColor: theme.field,
          borderRadius: radius.box,
          borderWidth: 1,
          borderColor: theme.fieldBorder,
        }}
      >
        {btn(-1, '−', `${label ?? ''} 하나 줄이기`)}
        <TextInput
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^0-9]/g, ''))}
          keyboardType="number-pad"
          placeholder={placeholder}
          placeholderTextColor={theme.textMuted}
          style={[
            { flex: 1, minWidth: 0, textAlign: 'center', color: theme.text, fontSize: 20, fontFamily: fonts.num, paddingVertical: 0 },
            { outlineWidth: 0 },
          ]}
        />
        {btn(1, '+', `${label ?? ''} 하나 늘리기`)}
      </View>
    </View>
  );
};

interface DateStepperProps {
  value: string;
  onChange: (value: string) => void;
  /** 이 날보다 뒤로는 못 간다 (기록은 미래 날짜가 없다) */
  max?: string;
}

/** ‹ 10월 25일 (일) › — 날짜를 하루씩 넘긴다. 오늘이 아니면 '오늘' 버튼 */
export const DateStepper = ({ value, onChange, max }: DateStepperProps) => {
  const theme = useTheme();
  const today = todayString();
  const canNext = !max || value < max;
  const arrow = (d: number, glyph: string, a11y: string, enabled: boolean) => (
    <Pressable
      onPress={() => enabled && onChange(addDays(value, d))}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius.box,
        borderWidth: 1,
        borderColor: theme.fieldBorder,
        backgroundColor: theme.field,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: !enabled ? 0.35 : pressed ? 0.6 : 1,
      })}
    >
      <T variant="heading">{glyph}</T>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
      {arrow(-1, '‹', '하루 전', true)}
      <View style={{ flex: 1, alignItems: 'center' }}>
        <T variant="heading">{formatLongDate(value)}</T>
        {value === today ? <T variant="small">오늘</T> : null}
      </View>
      {value !== today ? (
        <Pressable
          onPress={() => onChange(today)}
          accessibilityRole="button"
          style={({ pressed }) => ({
            height: 32,
            paddingHorizontal: space(3),
            borderRadius: radius.pill,
            backgroundColor: theme.rest.soft,
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <T variant="small" color={theme.text}>
            오늘
          </T>
        </Pressable>
      ) : null}
      {arrow(1, '›', '하루 뒤', canNext)}
    </View>
  );
};

// ── 버튼 ───────────────────────────────────────────────

interface ButtonProps {
  title: string;
  onPress: () => void;
  /** primary = 꽉 찬 버튼, secondary = 테두리 버튼 */
  variant?: 'primary' | 'secondary';
  /** primary 의 색. 운동 종류가 정해진 화면에서는 그 색으로 */
  kind?: WorkoutKind | PlanKind;
  disabled?: boolean;
}

export const Button = ({ title, onPress, variant = 'primary', kind, disabled = false }: ButtonProps) => {
  const theme = useTheme();
  const primary = variant === 'primary';
  const fill = kind ? kindColors(theme, kind).solid : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => ({
        height: 52,
        borderRadius: radius.tile,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: space(5),
        backgroundColor: primary ? fill : theme.surface,
        borderWidth: primary ? 0 : 1,
        borderColor: theme.fieldBorder,
        opacity: disabled ? 0.45 : pressed ? 0.75 : 1,
      })}
    >
      <T variant="bodyStrong" color={primary ? (kind ? theme.onKind : theme.bg) : theme.text} style={{ fontSize: 16, fontWeight: '700' }}>
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
}

/** 글자 버튼 (행 안의 보조 동작) */
export const TextButton = ({ title, onPress, tone = 'default', disabled = false }: TextButtonProps) => {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.danger : tone === 'muted' ? theme.textMuted : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.55 : 1, paddingVertical: space(1.5) })}
    >
      <T variant="bodyStrong" color={color} style={{ fontSize: 14, lineHeight: 20 }}>
        {title}
      </T>
    </Pressable>
  );
};

// ── 고르기 ─────────────────────────────────────────────

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

/** 화면 안의 보기 전환. 회색 홈 안에서 고른 칸만 흰색으로 떠오른다 */
export const Segmented = <V extends string>({ options, value, onChange }: SegmentedProps<V>) => {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      style={{ flexDirection: 'row', padding: 3, borderRadius: radius.tile, backgroundColor: theme.dark ? theme.field : theme.line }}
    >
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
              height: 38,
              borderRadius: radius.box - 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: selected ? theme.surface : 'transparent',
            }}
          >
            <T variant="label" color={selected ? theme.text : theme.textMuted} style={{ fontSize: 14, fontWeight: selected ? '700' : '600' }}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
};

interface KindPickerProps<V extends WorkoutKind | PlanKind> {
  options: { value: V; label: string }[];
  value: V;
  onChange: (value: V) => void;
  size?: 'large' | 'small';
}

/** 운동 종류 고르기. 고른 칸이 그 종류 색으로 칠해진다 */
export const KindPicker = <V extends WorkoutKind | PlanKind>({ options, value, onChange, size = 'large' }: KindPickerProps<V>) => {
  const theme = useTheme();
  const large = size === 'large';
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: space(2) }}>
      {options.map((option) => {
        const selected = option.value === value;
        const c = kindColors(theme, option.value);
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            style={({ pressed }) => ({
              flex: 1,
              height: large ? 56 : 40,
              borderRadius: radius.tile,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: space(2),
              backgroundColor: selected ? c.soft : theme.surface,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? c.solid : theme.line,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <KindDot kind={option.value} />
            <T variant={large ? 'bodyStrong' : 'label'} color={selected ? c.ink : theme.text} style={{ fontWeight: '700' }}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
};

/** 운동 종류 표시 점 */
export const KindDot = ({ kind, size = 10 }: { kind?: WorkoutKind | PlanKind; size?: number }) => {
  const theme = useTheme();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: kindColors(theme, kind).solid }} />;
};

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

export const Chip = ({ label, selected, onPress }: ChipProps) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => ({
        height: 36,
        paddingHorizontal: space(3.5),
        borderRadius: radius.pill,
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: selected ? theme.text : theme.fieldBorder,
        backgroundColor: selected ? theme.text : theme.surface,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <T variant="label" color={selected ? theme.bg : theme.text} style={{ fontSize: 14 }}>
        {label}
      </T>
    </Pressable>
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
    <T variant="label">{label}</T>
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
      <T variant="numLg">{value}</T>
      {unit ? <T variant="label">{unit}</T> : null}
    </View>
    {sub ? <T variant="small" style={{ fontWeight: '400' }}>{sub}</T> : null}
  </View>
);

interface ProgressBarProps {
  value: number; // 0~1 (넘으면 꽉 채운다)
  marker?: number; // 0~1, 기준선 (예: 오늘까지의 목표)
  color?: string;
}

export const ProgressBar = ({ value, marker, color }: ProgressBarProps) => {
  const theme = useTheme();
  const clamp = (n: number): number => Math.max(0, Math.min(1, n));
  return (
    <View style={{ height: 10, borderRadius: radius.pill, backgroundColor: theme.dark ? theme.field : theme.line, position: 'relative' }}>
      <View style={{ width: `${clamp(value) * 100}%`, height: '100%', borderRadius: radius.pill, backgroundColor: color ?? theme.text }} />
      {marker !== undefined && marker > 0 && marker < 1 ? (
        <View style={{ position: 'absolute', left: `${clamp(marker) * 100}%`, top: -4, bottom: -4, width: 2, marginLeft: -1, backgroundColor: theme.text }} />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space(4) },
  page: { gap: space(4), paddingBottom: space(10), width: '100%', maxWidth: 640, alignSelf: 'center' },
});
