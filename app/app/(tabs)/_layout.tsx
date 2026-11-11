import React from 'react';
import { View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';
import Svg, { Circle, Path } from 'react-native-svg';

import { Button, Heading, LoadingScreen, Message, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { fonts, layout, space, useTheme } from '@/theme';

// 탭 아이콘 (24×24, 선 2px)
const ICONS: Record<string, React.ReactNode> = {
  index: (
    <>
      <Circle cx="12" cy="12" r="8" />
      <Path d="M12 8v4l2.5 2.5" />
    </>
  ),
  calendar: (
    <>
      <Path d="M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z" />
      <Path d="M4 10h16M8 4v4M16 4v4" />
    </>
  ),
  coach: <Path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-7l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />,
  me: (
    <>
      <Circle cx="12" cy="8.5" r="3.5" />
      <Path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5" />
    </>
  ),
};

const TabIcon = ({ name, color }: { name: string; color: string }) => (
  <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden importantForAccessibility="no" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    {ICONS[name]}
  </Svg>
);

const TabsLayout = () => {
  const theme = useTheme();
  const { signedIn, user, loading, error, refreshUser } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!signedIn) return <Redirect href="/login" />;
  // 로그인은 됐는데 백엔드에서 프로필을 못 받은 경우 (서버가 꺼졌거나 네트워크 문제)
  if (!user) {
    return (
      <Screen>
        <View style={{ width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', gap: space(4) }}>
          <Heading title="연결하지 못했어요" caption="잠시 뒤에 다시 시도해 주세요." />
          <Message text={error || '프로필을 불러오지 못했습니다.'} tone="error" />
          <Button title="다시 시도" onPress={() => void refreshUser()} />
        </View>
      </Screen>
    );
  }

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.paper,
          borderTopColor: theme.line,
          borderTopWidth: 1,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarIcon: ({ color }) => <TabIcon name={route.name} color={color} />,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '700', fontFamily: fonts.sans },
        tabBarActiveTintColor: theme.ink,
        tabBarInactiveTintColor: theme.muted,
        sceneStyle: { backgroundColor: theme.paper },
      })}
    >
      <Tabs.Screen name="index" options={{ title: '오늘' }} />
      <Tabs.Screen name="calendar" options={{ title: '캘린더' }} />
      <Tabs.Screen name="coach" options={{ title: '코치' }} />
      <Tabs.Screen name="me" options={{ title: '나' }} />
    </Tabs>
  );
};

export default TabsLayout;
