import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { space, tracking, useTheme } from '@/theme';

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: 'default' | 'email-address' | 'decimal-pad';
  autoCapitalize?: 'none' | 'sentences';
  multiline?: boolean;
}

// 박스 대신 밑줄 하나로 입력 영역을 표시한다. 포커스되면 밑줄이 진해진다.
export const Field = ({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType = 'default',
  autoCapitalize = 'none',
  multiline = false,
}: FieldProps) => {
  const theme = useTheme();
  const [focused, setFocused] = React.useState<boolean>(false);

  return (
    <View style={{ gap: space(1) }}>
      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '600' }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          borderBottomWidth: 1,
          borderBottomColor: focused ? theme.text : theme.border,
          color: theme.text,
          paddingVertical: space(2),
          fontSize: 16,
          minHeight: multiline ? 72 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
};

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'ghost';
  disabled?: boolean;
}

export const Button = ({ title, onPress, variant = 'primary', disabled = false }: ButtonProps) => {
  const theme = useTheme();
  const primary = variant === 'primary';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: primary ? theme.accent : 'transparent',
        borderColor: primary ? theme.accent : theme.text,
        borderWidth: 1,
        paddingVertical: space(4),
        alignItems: 'center',
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          color: primary ? theme.onAccent : theme.text,
          fontWeight: '700',
          fontSize: 13,
          letterSpacing: tracking.label,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
};

interface HeadingProps {
  eyebrow: string; // 영문 대문자 소제목 (예: 'TREND')
  title: string;
  caption?: string;
}

// 화면 상단 타이틀. 영문 eyebrow + 굵은 한글 제목 + 보조 설명.
export const Heading = ({ eyebrow, title, caption }: HeadingProps) => {
  const theme = useTheme();

  return (
    <View style={{ gap: space(1.5), paddingBottom: space(2) }}>
      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: tracking.wide }}>
        {eyebrow.toUpperCase()}
      </Text>
      <Text style={{ color: theme.text, fontSize: 28, fontWeight: '800', letterSpacing: tracking.tight }}>
        {title}
      </Text>
      {caption ? (
        <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>{caption}</Text>
      ) : null}
    </View>
  );
};

interface DividerProps {
  strong?: boolean;
}

export const Divider = ({ strong = false }: DividerProps) => {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: strong ? theme.text : theme.border }} />;
};

interface ScreenProps {
  children: React.ReactNode;
}

// 네비게이션 헤더를 쓰지 않으므로 상태바 영역은 Screen 이 직접 비운다.
export const Screen = ({ children }: ScreenProps) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { backgroundColor: theme.bg, paddingTop: insets.top + space(4) }]}>
      {children}
    </View>
  );
};

interface MessageProps {
  text: string;
  tone?: 'error' | 'muted';
}

export const Message = ({ text, tone = 'muted' }: MessageProps) => {
  const theme = useTheme();
  if (!text) return null;
  return (
    <Text style={{ color: tone === 'error' ? theme.danger : theme.textMuted, fontSize: 13 }}>{text}</Text>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: space(5), paddingVertical: space(4), gap: space(3) },
});

interface SegmentedProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

// 탭 · 종류 고르기. 고른 칸만 채운다.
export const Segmented = <T extends string>({ options, value, onChange }: SegmentedProps<T>) => {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: theme.text }}>
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            style={{
              flex: 1,
              paddingVertical: space(2.5),
              alignItems: 'center',
              backgroundColor: selected ? theme.accent : 'transparent',
              borderLeftWidth: index === 0 ? 0 : 1,
              borderLeftColor: theme.text,
            }}
          >
            <Text style={{ color: selected ? theme.onAccent : theme.text, fontSize: 12, fontWeight: '700' }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

interface SectionTitleProps {
  title: string; // 영문 대문자 소제목
  caption?: string;
  right?: React.ReactNode;
}

// 굵은 윗선 + 소제목. 화면 안의 구역을 나눈다.
export const SectionTitle = ({ title, caption, right }: SectionTitleProps) => {
  const theme = useTheme();
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: theme.text, paddingTop: space(4), gap: space(1) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: theme.text, fontSize: 11, fontWeight: '800', letterSpacing: tracking.wide }}>
          {title.toUpperCase()}
        </Text>
        {right}
      </View>
      {caption ? <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>{caption}</Text> : null}
    </View>
  );
};

interface MiniInputProps {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'decimal-pad' | 'number-pad';
  flex?: number;
  width?: number;
}

// 한 줄에 여러 개 놓는 작은 입력 (세트 · 루틴 표).
export const MiniInput = ({ label, value, onChangeText, placeholder, keyboardType = 'default', flex, width }: MiniInputProps) => {
  const theme = useTheme();
  const [focused, setFocused] = React.useState<boolean>(false);
  return (
    <View style={{ flex, width, minWidth: 0, gap: 2 }}>
      {label ? <Text style={{ color: theme.textMuted, fontSize: 10, fontWeight: '600' }}>{label}</Text> : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        keyboardType={keyboardType}
        autoCapitalize="none"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          borderBottomWidth: 1,
          borderBottomColor: focused ? theme.text : theme.border,
          color: theme.text,
          paddingVertical: space(1.5),
          fontSize: 14,
          minWidth: 0,
        }}
      />
    </View>
  );
};

interface TextButtonProps {
  title: string;
  onPress: () => void;
  tone?: 'default' | 'muted' | 'danger';
  disabled?: boolean;
}

// 밑줄 없는 글자 버튼 (행 안의 보조 동작).
export const TextButton = ({ title, onPress, tone = 'default', disabled = false }: TextButtonProps) => {
  const theme = useTheme();
  const color = tone === 'danger' ? theme.danger : tone === 'muted' ? theme.textMuted : theme.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.6 : 1, paddingVertical: space(1) })}
    >
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
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
      accessibilityState={{ selected }}
      style={{
        paddingHorizontal: space(3),
        paddingVertical: space(1.5),
        borderWidth: 1,
        borderColor: selected ? theme.accent : theme.border,
        backgroundColor: selected ? theme.accent : 'transparent',
      }}
    >
      <Text style={{ color: selected ? theme.onAccent : theme.textMuted, fontSize: 12, fontWeight: selected ? '700' : '500' }}>
        {label}
      </Text>
    </Pressable>
  );
};

interface StatProps {
  label: string;
  value: string;
  sub?: string;
}

// 큰 숫자 하나 + 이름. 여러 개를 가로로 나란히 놓는다.
export const Stat = ({ label, value, sub }: StatProps) => {
  const theme = useTheme();
  return (
    <View style={{ flexBasis: '30%', flexGrow: 1, minWidth: 92, gap: 2 }}>
      <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: '800', letterSpacing: tracking.tight, fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      {sub ? <Text style={{ color: theme.textMuted, fontSize: 11 }}>{sub}</Text> : null}
    </View>
  );
};

interface ProgressBarProps {
  value: number; // 0~1 (넘으면 꽉 채운다)
  marker?: number; // 0~1, 기준선 (예: 오늘까지의 목표)
}

export const ProgressBar = ({ value, marker }: ProgressBarProps) => {
  const theme = useTheme();
  const clamp = (n: number): number => Math.max(0, Math.min(1, n));
  return (
    <View style={{ height: 8, backgroundColor: theme.grid, position: 'relative' }}>
      <View style={{ width: `${clamp(value) * 100}%`, height: '100%', backgroundColor: theme.accent }} />
      {marker !== undefined && marker > 0 && marker < 1 ? (
        <View
          style={{
            position: 'absolute',
            left: `${clamp(marker) * 100}%`,
            top: -3,
            bottom: -3,
            width: 2,
            backgroundColor: theme.textMuted,
          }}
        />
      ) : null}
    </View>
  );
};
