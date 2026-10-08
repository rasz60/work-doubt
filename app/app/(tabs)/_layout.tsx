import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Redirect, Tabs } from 'expo-router';

import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { tracking, useTheme } from '@/theme';

const TabsLayout = () => {
  const theme = useTheme();
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (!user) return <Redirect href="/login" />;

  // 아이콘 없이 영문 대문자 라벨만 쓰는 텍스트 탭바. 헤더는 각 화면의 Heading 이 대신한다.
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.bg,
          borderTopColor: theme.text,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIcon: () => null,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', letterSpacing: tracking.label },
        tabBarItemStyle: { justifyContent: 'center' },
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'TREND' }} />
      <Tabs.Screen name="record" options={{ title: 'RECORD' }} />
      <Tabs.Screen name="coach" options={{ title: 'COACH' }} />
      <Tabs.Screen name="profile" options={{ title: 'PROFILE' }} />
    </Tabs>
  );
};

export default TabsLayout;
