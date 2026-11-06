import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';

import { Button, Field, Group, Heading, Message, Page, Row, Screen, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { appleHealthSupported } from '@/features/health/appleHealth';
import { useAuth } from '@/hooks/useAuth';
import { formatAgo, formatShortDate, todayString, weekdayLabel } from '@/lib/date';
import { space } from '@/theme';
import type { BodyMetric, Plan, SyncConnection } from '@/types';

const planSummary = (plan?: Plan): string => {
  const active = plan?.days.filter((d) => d.kind !== 'rest') ?? [];
  if (!plan || active.length === 0) return '아직 없어요';
  const group = (kind: 'run' | 'weight', label: string): string => {
    const days = active.filter((d) => d.kind === kind).map((d) => weekdayLabel(d.weekday));
    return days.length ? `${days.join('')} ${label}` : '';
  };
  return [group('run', '러닝'), group('weight', '웨이트')].filter(Boolean).join(' · ');
};

// 나: 이름, 메뉴 줄(신체 기록 · 주간 계획 · 그룹 · Apple 건강), 로그아웃.
// 입력은 "이름 고치기"를 눌렀을 때만 나온다.
const Me = () => {
  const { user, signOut, refreshUser } = useAuth();
  const today = todayString();
  const [editing, setEditing] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [latest, setLatest] = useState<BodyMetric | null>(null);
  const [plan, setPlan] = useState<Plan | undefined>(undefined);
  const [groupCount, setGroupCount] = useState<number | null>(null);
  const [apple, setApple] = useState<SyncConnection | undefined>(undefined);

  // 다른 화면에서 고치고 돌아오면 요약을 다시 읽는다. 하나가 실패해도 나머지는 보인다
  useFocusEffect(
    useCallback(() => {
      api.fetchLatestMetric().then(setLatest).catch(() => setLatest(null));
      api
        .fetchPlans()
        .then(({ items }) => setPlan(items.find((p) => p.effective_from <= today)))
        .catch(() => undefined);
      api
        .fetchGroups()
        .then(({ items }) => setGroupCount(items.length))
        .catch(() => undefined);
      api
        .fetchSync()
        .then(({ connections }) => setApple(connections.find((c) => c.provider === 'apple_health')))
        .catch(() => undefined);
    }, [today]),
  );

  const saveName = async (): Promise<void> => {
    setError('');
    try {
      await api.updateProfile({ display_name: name.trim() });
      await refreshUser();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '이름을 저장하지 못했습니다.');
    }
  };

  return (
    <Screen>
      <Page>
        <Heading
          title={user?.display_name || '나'}
          caption={user?.email || ''}
          right={
            editing ? null : (
              <TextButton
                title="이름 고치기"
                tone="muted"
                onPress={() => {
                  setName(user?.display_name ?? '');
                  setEditing(true);
                }}
              />
            )
          }
        />

        {editing ? (
          <View style={{ gap: space(3) }}>
            <Field label="표시 이름" value={name} onChangeText={setName} autoFocus onSubmitEditing={() => void saveName()} />
            <View style={{ flexDirection: 'row', gap: space(2) }}>
              <Button title="저장" onPress={() => void saveName()} style={{ flex: 1 }} />
              <Button title="취소" variant="secondary" onPress={() => setEditing(false)} style={{ flex: 1 }} />
            </View>
            <Message text={error} tone="error" />
          </View>
        ) : null}

        <Group flush>
          <Row
            first
            title="신체 기록"
            meta={latest ? `${latest.weight_kg ? `체중 ${latest.weight_kg}kg · ` : ''}${formatShortDate(latest.measured_at)}` : '체중을 기록하면 칼로리 추정이 정확해져요'}
            onPress={() => router.push('/body')}
          />
          <Row title="주간 계획" meta={planSummary(plan)} onPress={() => router.push('/plan')} />
          <Row title="그룹" meta={groupCount === null ? undefined : groupCount ? `${groupCount}개` : '참여한 그룹이 없어요'} onPress={() => router.push('/groups')} />
          {appleHealthSupported || apple ? (
            <Row
              title="Apple 건강"
              meta={apple ? (apple.last_error ? '오류 · 눌러서 확인' : `연결됨${apple.last_synced_at ? ` · ${formatAgo(apple.last_synced_at)}` : ''}`) : '연결 안 됨'}
              onPress={() => router.push('/health')}
            />
          ) : null}
        </Group>

        <TextButton
          title="로그아웃"
          tone="muted"
          onPress={() => {
            void signOut().then(() => router.replace('/login'));
          }}
        />
      </Page>
    </Screen>
  );
};

export default Me;
