import React from 'react';
import { Header, Loading, Message, Page, Screen, T } from '@/components/ui';

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

/** 오늘에서 한 단계 들어간 화면: 위에 ‹ 돌아가기 + 제목, 아래 본문 하나 */
export const StatsPage = ({ title, caption, back = '오늘', fallback = '/', loading, error, children }: StatsPageProps) => (
  <Screen>
    <Page>
      <Header back={back} fallback={fallback} title={title} />
      {caption ? <T variant="caption">{caption}</T> : null}
      <Message text={error ?? ''} tone="error" />
      {loading ? <Loading /> : children}
    </Page>
  </Screen>
);
