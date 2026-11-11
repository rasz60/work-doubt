import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';

import { AuthProvider } from '@/hooks/useAuth';
import { useTheme } from '@/theme';

// 웹 전용 전역 CSS: 바탕색, 키보드 포커스(흰 테두리 + 잉크 이중 고리: 어느 바탕에서든 보인다), 모션 줄이기
const WEB_CSS = `
html, body { background: #DBE5E1; }
@media (prefers-color-scheme: dark) { html, body { background: #161C1F; color-scheme: dark; } }
[data-px], [role='button'], [role='tab'] { touch-action: manipulation; }
[data-px]:focus { outline: none; }
[data-px]:focus-visible { outline: 3px solid #FFFFFF; outline-offset: 2px; box-shadow: 0 0 0 6px #1F2D3A; }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
`;

const useWebStyles = (): void => {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const el = document.createElement('style');
    el.setAttribute('data-px-style', '1');
    el.textContent = WEB_CSS;
    document.head.appendChild(el);
    return () => el.remove();
  }, []);
};

const RootLayout = () => {
  const theme = useTheme();
  // 한글 도트 글꼴 Galmuri. 불러오는 동안 잠깐 시스템 글꼴로 보이는 편이 빈 화면보다 낫다 (실패해도 그대로 쓴다)
  useFonts({
    Galmuri11: require('galmuri/dist/Galmuri11.ttf'),
    Galmuri11Bold: require('galmuri/dist/Galmuri11-Bold.ttf'),
    Galmuri14: require('galmuri/dist/Galmuri14.ttf'),
  });
  useWebStyles();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.paper },
            headerTintColor: theme.ink,
            contentStyle: { backgroundColor: theme.paper },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="(screens)" options={{ headerShown: false }} />
          <Stack.Screen name="plan" options={{ headerShown: false }} />
          <Stack.Screen name="stats" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
};

export default RootLayout;
