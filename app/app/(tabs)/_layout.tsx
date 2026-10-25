import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Redirect, Tabs } from 'expo-router';

import { Button, Message, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { tracking, useTheme } from '@/theme';

const TabsLayout = () => {
  const theme = useTheme();
  const { signedIn, user, loading, error, refreshUser } = useAuth();

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }
  if (!signedIn) return <Redirect href="/login" />;
  // 로그인은 됐는데 백엔드에서 프로필을 못 받은 경우 (서버가 꺼졌거나 네트워크 문제)
  if (!user) {
    return (
      <Screen>
        <Message text={error || '프로필을 불러오지 못했습니다.'} tone="error" />
        <Button title="다시 시도" onPress={() => void refreshUser()} />
      </Screen>
    );
  }

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
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700', letterSpacing: tracking.label },
        tabBarItemStyle: { justifyContent: 'center' },
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'HOME' }} />
      <Tabs.Screen name="record" options={{ title: 'RECORD' }} />
      <Tabs.Screen name="coach" options={{ title: 'COACH' }} />
      <Tabs.Screen name="profile" options={{ title: 'PROFILE' }} />
    </Tabs>
  );
};

export default TabsLayout;
