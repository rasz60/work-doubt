import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/Pixel';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme';

// 오늘의 요약 한 줄을 누르면 들어오는 화면들 (러닝 · 웨이트 · 종목 · 칼로리). 탭 막대 없이 ‹ 오늘 로 돌아간다
const StatsLayout = () => {
  const theme = useTheme();
  const { signedIn, loading } = useAuth();

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  if (!signedIn) return <Redirect href="/login" />;
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.paper } }} />;
};

export default StatsLayout;
