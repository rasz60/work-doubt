import React from 'react';
import { View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Loading, PixelArt, TAB_ICONS } from '@/components/Pixel';
import { Button, Message, RoundKey, Screen, T } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { OUTLINE, layout, space, useTheme } from '@/theme';

// 키(원형 버튼) 모양 탭 바: 민트 몸체 띠 위에 도트 아이콘이 든 키 4개
const KeyTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={{ backgroundColor: theme.mint, borderTopWidth: OUTLINE, borderTopColor: theme.outline, paddingBottom: Math.max(insets.bottom, space(2)), paddingTop: space(2) }}
    >
      <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 3, backgroundColor: theme.mintLight }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-around', maxWidth: layout.maxWidth, width: '100%', alignSelf: 'center' }}>
        {state.routes.map((route, index) => {
          const selected = state.index === index;
          const title = String(descriptors[route.key]?.options.title ?? route.name);
          const onPress = (): void => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <View key={route.key} style={{ alignItems: 'center', gap: space(1), minWidth: 64 }}>
              {/* 켜진 키 위에는 빨간 불 */}
              <View style={{ width: 6, height: 6, backgroundColor: selected ? theme.led : 'transparent' }} />
              <RoundKey size={44} selected={selected} onPress={onPress} accessibilityLabel={title}>
                <PixelArt bitmap={TAB_ICONS[route.name] ?? TAB_ICONS.index ?? []} cell={3} colors={{ k: theme.outline }} />
              </RoundKey>
              <T variant="small" color={theme.onInk} style={{ fontSize: 12 }}>
                {title}
              </T>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const TabsLayout = () => {
  const theme = useTheme();
  const { signedIn, user, loading, error, refreshUser } = useAuth();

  if (loading) {
    return (
      <Screen>
        <Loading />
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
      tabBar={(props) => <KeyTabBar {...props} />}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: theme.paper } }}
    >
      <Tabs.Screen name="index" options={{ title: '오늘' }} />
      <Tabs.Screen name="calendar" options={{ title: '캘린더' }} />
      <Tabs.Screen name="coach" options={{ title: '코치' }} />
      <Tabs.Screen name="me" options={{ title: '나' }} />
    </Tabs>
  );
};

export default TabsLayout;
