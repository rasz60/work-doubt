import React from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BarlowCondensed_600SemiBold, BarlowCondensed_700Bold, useFonts } from '@expo-google-fonts/barlow-condensed';

import { AuthProvider } from '@/hooks/useAuth';
import { useTheme } from '@/theme';

const RootLayout = () => {
  const theme = useTheme();
  // 숫자 글꼴. 불러오는 동안 잠깐 기본 글꼴로 보이는 편이 빈 화면보다 낫다 (실패해도 그대로 쓴다)
  useFonts({ BarlowCondensed_600SemiBold, BarlowCondensed_700Bold });

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style={theme.dark ? 'light' : 'dark'} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.bg },
            headerTintColor: theme.text,
            contentStyle: { backgroundColor: theme.bg },
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      </AuthProvider>
    </SafeAreaProvider>
  );
};

export default RootLayout;
