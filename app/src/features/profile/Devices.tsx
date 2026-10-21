import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button, Field, Message, SectionTitle, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { formatAgo } from '@/lib/date';
import { space, tracking, useTheme } from '@/theme';
import type { CreatedDevice, SyncConnection, SyncOverview } from '@/types';

const PROVIDER_LABELS: Record<SyncConnection['provider'], string> = {
  strava: 'Strava · 자동으로 가져옴',
  device: '기기 토큰 · 폰 자동화가 보냄',
};

const STRAVA_RESULTS: Record<string, { text: string; error: boolean }> = {
  ok: { text: 'Strava 를 연결했습니다. 최근 90일 활동을 가져왔습니다.', error: false },
  denied: { text: 'Strava 연결을 취소했거나 활동 읽기 권한을 주지 않았습니다.', error: true },
  failed: { text: 'Strava 연결에 실패했습니다. 잠시 뒤 다시 시도하세요.', error: true },
};

const copy = async (text: string): Promise<boolean> => {
  if (Platform.OS !== 'web' || !navigator.clipboard) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const sampleBody = (): string =>
  JSON.stringify({ date: '2026-10-21', type: 'running', distance_km: 5.2, duration_min: 28.5, calories_kcal: 320 });

// PROFILE › 연결된 기기: 운동 기록을 자동으로 넣어 주는 앱 · 기기.
export const Devices = () => {
  const theme = useTheme();
  const params = useLocalSearchParams<{ sync?: string; result?: string }>();

  const [overview, setOverview] = useState<SyncOverview | null>(null);
  const [deviceName, setDeviceName] = useState<string>('');
  const [created, setCreated] = useState<CreatedDevice | null>(null);
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [confirm, setConfirm] = useState<string>('');

  const load = useCallback(async (): Promise<void> => {
    try {
      setOverview(await api.fetchSync());
    } catch (err) {
      setError(err instanceof Error ? err.message : '연결된 기기를 불러오지 못했습니다.');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  // Strava 동의 화면에서 돌아온 결과 (?sync=strava&result=…)
  useEffect(() => {
    if (params.sync !== 'strava' || !params.result) return;
    const result = STRAVA_RESULTS[params.result];
    if (!result) return;
    if (result.error) setError(result.text);
    else setNotice(result.text);
  }, [params.sync, params.result]);

  const run = async (action: () => Promise<void>): Promise<void> => {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const connectStrava = (): Promise<void> =>
    run(async () => {
      const { url } = await api.fetchStravaAuthorizeURL();
      if (Platform.OS === 'web') window.location.assign(url);
      else await Linking.openURL(url);
    });

  const syncNow = (): Promise<void> =>
    run(async () => {
      setOverview(await api.runSync(true));
      setNotice('동기화했습니다.');
    });

  const createDevice = (): Promise<void> =>
    run(async () => {
      setCreated(await api.createDevice(deviceName));
      setDeviceName('');
      await load();
    });

  const disconnect = (conn: SyncConnection): Promise<void> => {
    if (confirm !== conn.id) {
      setConfirm(conn.id);
      return Promise.resolve();
    }
    setConfirm('');
    return run(async () => {
      await api.disconnect(conn.id);
      if (created?.connection.id === conn.id) setCreated(null);
      await load();
      setNotice(`${conn.name} 연결을 끊었습니다. 이미 받은 기록은 남아 있습니다.`);
    });
  };

  const connections = overview?.connections ?? [];
  const mono = Platform.OS === 'web' ? 'monospace' : undefined;

  return (
    <View style={{ gap: space(4) }}>
      <SectionTitle
        title="Devices"
        caption="연결한 앱 · 기기에서 운동 기록이 자동으로 들어옵니다. 들어온 기록은 RECORD 에서 고칠 수 있고, 연결을 끊어도 남습니다."
      />

      {connections.length === 0 ? <Message text="연결된 기기가 없습니다." /> : null}
      {connections.map((conn) => (
        <View key={conn.id} style={{ gap: space(1), paddingBottom: space(3), borderBottomWidth: 1, borderBottomColor: theme.border }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space(2) }}>
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: '800', flex: 1 }} numberOfLines={1}>
              {conn.name}
            </Text>
            <Text style={{ color: conn.last_error ? theme.danger : theme.text, fontSize: 10, fontWeight: '800', letterSpacing: tracking.label }}>
              {conn.last_error ? 'ERROR' : conn.last_synced_at ? 'SYNCED' : 'WAITING'}
            </Text>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12 }}>
            {PROVIDER_LABELS[conn.provider]} · {conn.last_synced_at ? `마지막 동기화 ${formatAgo(conn.last_synced_at)}` : '아직 받은 기록 없음'}
          </Text>
          {conn.last_error ? <Text style={{ color: theme.danger, fontSize: 12 }}>{conn.last_error}</Text> : null}
          <View style={{ flexDirection: 'row', gap: space(4) }}>
            {conn.provider === 'strava' ? <TextButton title="지금 동기화" onPress={() => void syncNow()} disabled={busy} /> : null}
            <TextButton title={confirm === conn.id ? '정말 끊기' : '연결 끊기'} tone="danger" onPress={() => void disconnect(conn)} disabled={busy} />
          </View>
        </View>
      ))}

      <Message text={error} tone="error" />
      <Message text={notice} />

      {created ? (
        <View style={{ gap: space(2), borderWidth: 1, borderColor: theme.text, padding: space(4) }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: '800' }}>{created.connection.name} 토큰 — 지금 한 번만 보입니다</Text>
          <Text selectable style={{ color: theme.text, fontSize: 12, fontFamily: mono }}>
            {created.token}
          </Text>
          <TextButton
            title="토큰 복사"
            onPress={() => void copy(created.token).then((ok) => setNotice(ok ? '토큰을 복사했습니다.' : '토큰을 길게 눌러 복사하세요.'))}
          />
          <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>
            폰 자동화(iPhone 단축어의 &apos;URL의 내용 가져오기&apos;, Android 자동화 앱의 HTTP 요청 등)에서 운동이 끝날 때 아래처럼 보내면 기록됩니다. 같은
            기록을 다시 보내도 한 번만 저장됩니다.
          </Text>
          <Text selectable style={{ color: theme.text, fontSize: 11, fontFamily: mono, lineHeight: 17 }}>
            {`POST ${created.ingest_url}\nAuthorization: Bearer ${created.token.slice(0, 8)}…\nContent-Type: application/json\n\n${sampleBody()}`}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 11, lineHeight: 17 }}>
            type: running · 러닝 / strength · 웨이트 / 그 밖은 기타 · 날짜 대신 start(시작 시각) · 거리 distance_m · 시간 duration_sec 도 됩니다. 여러 개는
            {' {"workouts": [ … ]} '}로 묶어 보냅니다.
          </Text>
          <TextButton title="주소 복사" onPress={() => void copy(created.ingest_url).then((ok) => setNotice(ok ? '주소를 복사했습니다.' : '주소를 길게 눌러 복사하세요.'))} />
        </View>
      ) : null}

      <View style={{ gap: space(3) }}>
        <Text style={{ color: theme.textMuted, fontSize: 11, fontWeight: '700' }}>새로 연결</Text>
        {overview?.strava_enabled ? (
          <>
            <Text style={{ color: theme.textMuted, fontSize: 12, lineHeight: 18 }}>
              Garmin · Samsung Health · Apple Watch 운동 앱 등에서 Strava 로 올라간 활동을 10분마다 가져옵니다.
            </Text>
            <Button title="CONNECT STRAVA" variant="ghost" onPress={() => void connectStrava()} disabled={busy} />
          </>
        ) : (
          <Message text="Strava 연결은 서버에 Strava 앱 키를 설정하면 켜집니다." />
        )}
        <Field label="기기 이름 (기기 토큰)" value={deviceName} onChangeText={setDeviceName} placeholder="내 아이폰" />
        <Button title="CREATE DEVICE TOKEN" variant="ghost" onPress={() => void createDevice()} disabled={busy} />
      </View>
    </View>
  );
};
