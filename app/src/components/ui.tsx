import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { radius, space, useTheme } from '@/theme';

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

  return (
    <View style={{ gap: space(1), paddingHorizontal: space(1) }}>
      <Text style={{ color: theme.textMuted, fontSize: 12, marginBottom: space(1) }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        multiline={multiline}
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          borderWidth: 1,
          borderRadius: radius,
          color: theme.text,
          paddingHorizontal: space(3),
          paddingVertical: space(2.5),
          fontSize: 15,
          minHeight: multiline ? 80 : undefined,
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
        borderColor: primary ? theme.accent : theme.border,
        borderWidth: 1,
        borderRadius: radius,
        paddingVertical: space(3),
        alignItems: 'center',
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <Text style={{ color: primary ? '#ffffff' : theme.text, fontWeight: '600', fontSize: 15 }}>
        {title}
      </Text>
    </Pressable>
  );
};

interface ScreenProps {
  children: React.ReactNode;
}

export const Screen = ({ children }: ScreenProps) => {
  const theme = useTheme();
  return <View style={[styles.screen, { backgroundColor: theme.bg, padding: space(4) }]}>{children}</View>;
};

interface MessageProps {
  text: string;
  tone?: 'error' | 'muted';
}

export const Message = ({ text, tone = 'muted' }: MessageProps) => {
  const theme = useTheme();
  if (!text) return null;
  return (
    <Text style={{ color: tone === 'error' ? theme.up : theme.textMuted, fontSize: 13 }}>{text}</Text>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, padding: space(4), gap: space(3) },
});
