import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Redirect, Stack } from 'expo-router';

import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme';

// 홈의 요약 한 줄을 누르면 들어오는 화면들 (러닝 · 웨이트 · 종목 · 칼로리). 탭 막대 없이 ‹ 홈 으로 돌아간다
const StatsLayout = () => {
  const theme = useTheme();
  const { signedIn, loading } = useAuth();

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={theme.text} />
      </Screen>
    );
  }
  if (!signedIn) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.bg } }} />;
};

export default StatsLayout;
