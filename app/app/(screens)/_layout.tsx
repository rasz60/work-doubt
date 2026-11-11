import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/Pixel';
import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme';

// 탭 위로 쌓이는 화면들 (기록하기 /log · 신체 기록 /body · 그룹 /groups · Apple 건강 /health).
// 괄호 폴더라 주소에는 나타나지 않는다. 로그인하지 않았으면 로그인으로 보낸다
const ScreensLayout = () => {
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

export default ScreensLayout;
