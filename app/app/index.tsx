import React from 'react';
import { ActivityIndicator } from 'react-native';
import { Redirect } from 'expo-router';

import { Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';

// 진입점: 저장된 세션 유무로 로그인/탭 화면을 가른다.
const Index = () => {
  const { signedIn, loading } = useAuth();

  if (loading) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }
  return <Redirect href={signedIn ? '/(tabs)' : '/login'} />;
};

export default Index;
