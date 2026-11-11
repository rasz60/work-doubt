import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Group, Header, Loading, Message, Page, Screen, T, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { appleHealthSupported, connectAppleHealth, syncAppleHealth } from '@/features/health/appleHealth';
import { formatAgo } from '@/lib/date';
import { space, useTheme } from '@/theme';
import type { ImportResult, SyncConnection } from '@/types';

const describeResult = (r: ImportResult): string => {
  if (r.fetched === 0) return '가져올 운동이 없어요. 건강 앱 › 공유 › 앱에서 운동 읽기를 허용했는지 확인하세요.';
  const parts = [`받은 운동 ${r.fetched}개`, `새로 저장 ${r.saved}개`, `이미 있어 건너뜀 ${r.duplicates}개`];
  if (r.skipped) parts.push(`기록할 수 없어 건너뜀 ${r.skipped}개`);
  return parts.join(' · ');
};

// Apple 건강: iPhone 앱(운동기록 앱 · ae:p 앱 안의 웹)이 HealthKit 에서 운동을 읽어 보낸다. 그 밖에서는 연결 상태만 보인다.
const Health = () => {
  const theme = useTheme();
  const [conn, setConn] = useState<SyncConnection | undefined>(undefined);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<boolean>(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const load = useCallback(async (): Promise<void> => {
    try {
      const { connections } = await api.fetchSync();
      setConn(connections.find((c) => c.provider === 'apple_health'));
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결 상태를 불러오지 못했습니다.');
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (action: () => Promise<ImportResult | null>): Promise<void> => {
    setError('');
    setResult('');
    setBusy(true);
    try {
      const r = await action();
      if (r) setResult(describeResult(r));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Apple 건강에서 가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async (): Promise<void> => {
    if (!conn) return;
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setConfirm(false);
    try {
      await api.disconnect(conn.id);
      setResult('연결을 끊었어요. 받은 기록은 그대로 남아요.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결을 끊지 못했습니다.');
    }
  };

  const status = conn ? (conn.last_error ? '오류' : conn.last_synced_at ? '연결됨' : '기다리는 중') : '연결 안 됨';

  return (
    <Screen>
      <Page>
        <Header back="뒤로" fallback="/me" title="Apple 건강" />
        <T variant="caption">Apple Watch · 건강 앱에 남은 운동(종류 · 시간 · 거리 · 칼로리 · 심박)을 기록으로 가져와요. 이미 있는 운동은 건너뛰어요.</T>

        {loaded ? (
          <Group style={{ gap: space(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <T variant="heading">{status}</T>
              {conn?.last_synced_at ? <T variant="caption">마지막 {formatAgo(conn.last_synced_at)}</T> : null}
            </View>
            {conn?.last_error ? (
              <T variant="caption" color={theme.danger}>
                {conn.last_error}
              </T>
            ) : null}
            <T variant="caption">
              {appleHealthSupported
                ? conn
                  ? '새 운동은 오늘 화면을 열 때 자동으로 가져와요 (10분마다).'
                  : '연결하면 권한을 묻고 최근 90일 운동을 바로 가져와요.'
                : 'Apple 건강은 iPhone 의 ae:p 앱에서만 연결하고 보낼 수 있어요.'}
            </T>
          </Group>
        ) : (
          <Loading />
        )}

        {appleHealthSupported && loaded ? (
          conn ? (
            <View style={{ gap: space(2) }}>
              <Button title={busy ? '가져오는 중…' : '지금 가져오기'} variant="secondary" onPress={() => void run(() => syncAppleHealth(conn.last_synced_at))} disabled={busy} />
              <TextButton title="최근 90일 다시 보내기" tone="muted" onPress={() => void run(() => syncAppleHealth())} disabled={busy} />
            </View>
          ) : (
            <Button title={busy ? '가져오는 중…' : 'Apple 건강 연결'} onPress={() => void run(connectAppleHealth)} disabled={busy} />
          )
        ) : null}

        <Message text={error} tone="error" />
        <Message text={result} tone="ok" />

        {conn ? (
          <View style={{ gap: space(1) }}>
            <TextButton title={confirm ? '정말 끊을까요? 한 번 더 누르면 끊어요' : '연결 끊기'} tone={confirm ? 'danger' : 'muted'} onPress={() => void disconnect()} />
            {confirm && appleHealthSupported ? (
              <T variant="caption">끊은 뒤에도 앱의 건강 읽기 권한은 남아 있어요. 설정 › 건강 › 데이터 접근 및 기기에서 끌 수 있어요.</T>
            ) : null}
          </View>
        ) : null}
      </Page>
    </Screen>
  );
};

export default Health;
