import React from 'react';
import { Redirect, Stack } from 'expo-router';

import { Loading } from '@/components/Pixel';
import { Screen } from '@/components/ui';
import { PlanDraftProvider } from '@/features/record/PlanDraftContext';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme';

// 주간 계획: 요약(/plan) → 요일 하나(/plan/[weekday]) · 지난 계획(/plan/history). 세 화면이 같은 초안을 본다
const PlanLayout = () => {
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
  return (
    <PlanDraftProvider>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.paper } }} />
    </PlanDraftProvider>
  );
};

export default PlanLayout;
