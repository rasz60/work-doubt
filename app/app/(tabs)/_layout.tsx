import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Redirect, Tabs } from 'expo-router';

import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/theme';

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

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.bg },
        headerTintColor: theme.text,
        tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        tabBarActiveTintColor: theme.accent,
        tabBarInactiveTintColor: theme.textMuted,
        sceneStyle: { backgroundColor: theme.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: '변동폭' }} />
      <Tabs.Screen name="record" options={{ title: '기록' }} />
      <Tabs.Screen name="coach" options={{ title: 'AI 코치' }} />
      <Tabs.Screen name="profile" options={{ title: '프로필' }} />
    </Tabs>
  );
};

export default TabsLayout;
