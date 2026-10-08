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
