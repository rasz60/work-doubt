import React from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { router } from 'expo-router';

import { Message, Page, Screen, T } from '@/components/ui';
import { space, useTheme } from '@/theme';

interface StatsPageProps {
  title: string;
  caption?: string;
  /** 뒤로 갈 곳 이름 (기록이 없을 때 대신 갈 곳은 fallback) */
  back?: string;
  fallback?: '/' | '/stats/weight';
  loading?: boolean;
  error?: string;
  children?: React.ReactNode;
}

/** 홈에서 한 단계 들어간 화면: 위에 ‹ 돌아가기 + 제목, 아래 본문 하나 */
export const StatsPage = ({ title, caption, back = '홈', fallback = '/', loading, error, children }: StatsPageProps) => {
  const theme = useTheme();
  return (
    <Screen>
      <Page>
        <View style={{ gap: space(2), paddingTop: space(1) }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback))}
            accessibilityRole="button"
            accessibilityLabel={`${back}으로 돌아가기`}
            hitSlop={8}
            style={({ pressed }) => ({ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: space(1), opacity: pressed ? 0.55 : 1 })}
          >
            <T variant="heading" color={theme.textMuted} style={{ fontSize: 22, lineHeight: 24 }}>
              ‹
            </T>
            <T variant="bodyStrong" color={theme.textMuted}>
              {back}
            </T>
          </Pressable>
          <T variant="title">{title}</T>
          {caption ? <T variant="caption">{caption}</T> : null}
        </View>
        <Message text={error ?? ''} tone="error" />
        {loading ? <ActivityIndicator color={theme.text} /> : children}
      </Page>
    </Screen>
  );
};
