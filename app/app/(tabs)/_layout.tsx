import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button, Message, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { fonts, useTheme } from '@/theme';

// 탭 아이콘 (24×24, 선 2px)
const ICONS: Record<string, React.ReactNode> = {
  index: <Path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z" />,
  record: (
    <>
      <Path d="M6 4h12a1 1 0 0 1 1 1v15H5V5a1 1 0 0 1 1-1z" />
      <Path d="M12 9v6M9 12h6" />
    </>
  ),
  coach: <Path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  profile: (
    <>
      <Circle cx="12" cy="8.5" r="3.5" />
      <Path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
};

const TabIcon = ({ name, color }: { name: string; color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name]}
  </Svg>
);

const TabsLayout = () => {
  const theme = useTheme();
  const { signedIn, user, loading, error, refreshUser } = useAuth();

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator color={theme.text} />
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

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.line,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700', fontFamily: fonts.sans },
        tabBarActiveTintColor: theme.text,
        tabBarInactiveTintColor: theme.textMuted,
        sceneStyle: { backgroundColor: theme.bg },
      })}
    >
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="record" options={{ title: '기록' }} />
      <Tabs.Screen name="coach" options={{ title: '코치' }} />
      <Tabs.Screen name="profile" options={{ title: '내 정보' }} />
    </Tabs>
  );
};

export default TabsLayout;
