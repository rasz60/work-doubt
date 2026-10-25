import React, { useCallback, useEffect, useState } from 'react';
import { Linking, Platform, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { Button, Card, DateStepper, Field, Message, SectionTitle, Segmented, T, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { addDays, formatAgo, isDateString, todayString } from '@/lib/date';
import { radius, space, useTheme } from '@/theme';
import type { CreatedDevice, ImportResult, SyncConnection, SyncOverview } from '@/types';

const STRAVA_RESULTS: Record<string, { text: string; error: boolean }> = {
  ok: { text: 'Strava 를 연결했어요. 최근 90일 활동을 가져왔어요. 더 예전 기록은 아래 "전체"로 가져오세요.', error: false },
  denied: { text: 'Strava 연결을 취소했거나 활동 읽기 권한을 주지 않았어요.', error: true },
  failed: { text: 'Strava 연결에 실패했어요. 잠시 뒤 다시 시도하세요.', error: true },
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

const describeResult = (r: ImportResult): string => {
  const parts = [`가져온 활동 ${r.fetched}개`, `새로 저장 ${r.saved}개`, `이미 있어 건너뜀 ${r.duplicates}개`];
  if (r.skipped) parts.push(`기록할 수 없어 건너뜀 ${r.skipped}개`);
  return parts.join(' · ');
};

const Status = ({ conn }: { conn: SyncConnection }) => {
  const theme = useTheme();
  const label = conn.last_error ? '오류' : conn.last_synced_at ? '연결됨' : '기다리는 중';
  return (
    <View style={{ gap: space(1) }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
        <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
          {conn.name}
        </T>
        <View
          style={{
            backgroundColor: conn.last_error ? theme.dangerSoft : theme.rest.soft,
            borderRadius: radius.pill,
            paddingHorizontal: space(2.5),
            paddingVertical: 2,
          }}
        >
          <T variant="small" color={conn.last_error ? theme.danger : theme.text}>
            {label}
          </T>
        </View>
      </View>
      <T variant="caption">{conn.last_synced_at ? `마지막 동기화 ${formatAgo(conn.last_synced_at)}` : '아직 받은 기록 없음'}</T>
      {conn.last_error ? <T variant="caption" color={theme.danger}>{conn.last_error}</T> : null}
    </View>
  );
};

type Scope = 'day' | 'range' | 'all';

const SCOPES: { value: Scope; label: string }[] = [
  { value: 'day', label: '하루' },
  { value: 'range', label: '기간' },
  { value: 'all', label: '전체' },
];

interface StravaCardProps {
  conn: SyncConnection;
  onChanged: () => Promise<void>;
  onDisconnect: (conn: SyncConnection) => void;
  confirming: boolean;
}

// Strava 연결 하나: 하루 · 기간 · 전체를 골라 가져온다. 이미 있는 기록은 서버가 건너뛴다.
const StravaCard = ({ conn, onChanged, onDisconnect, confirming }: StravaCardProps) => {
  const theme = useTheme();
  const today = todayString();
  const [scope, setScope] = useState<Scope>('day');
  const [day, setDay] = useState<string>(today);
  const [from, setFrom] = useState<string>(addDays(today, -6));
  const [to, setTo] = useState<string>(today);
  const [busy, setBusy] = useState<boolean>(false);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const run = async (): Promise<void> => {
    setError('');
    setResult('');
    const [start, end] = scope === 'day' ? [day, day] : scope === 'range' ? [from, to] : ['', ''];
    if (scope !== 'all' && (!isDateString(start) || !isDateString(end))) {
      setError('날짜를 다시 골라 주세요.');
      return;
    }
    if (scope === 'range' && start > end) {
      setError('시작일이 끝날보다 뒤에 있어요.');
      return;
    }
    setBusy(true);
    try {
      setResult(describeResult(await api.importConnection(conn.id, start, end)));
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : '가져오지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space(4), borderWidth: 1, borderColor: theme.line, borderRadius: radius.tile, padding: space(3) }}>
      <Status conn={conn} />
      <T variant="caption">새 활동은 홈을 열 때 자동으로 가져와요 (10분마다). 지난 기록은 날짜를 골라 가져오세요. 이미 있는 운동은 건너뛰어요.</T>

      <Segmented options={SCOPES} value={scope} onChange={setScope} />
      {scope === 'day' ? <DateStepper value={day} onChange={setDay} max={today} /> : null}
      {scope === 'range' ? (
        <View style={{ gap: space(3) }}>
          <T variant="label">시작</T>
          <DateStepper value={from} onChange={setFrom} max={today} />
          <T variant="label">끝</T>
          <DateStepper value={to} onChange={setTo} max={today} />
        </View>
      ) : null}
      {scope === 'all' ? <Message text="이 Strava 계정의 모든 활동(최대 4,000개)을 가져와요. 몇십 초 걸릴 수 있어요." /> : null}

      <Button title={busy ? '가져오는 중…' : '가져오기'} variant="secondary" onPress={() => void run()} disabled={busy} />
      <Message text={error} tone="error" />
      <Message text={result} tone="ok" />
      <TextButton title={confirming ? '정말 끊을까요? (받은 기록은 남아요)' : '연결 끊기'} tone={confirming ? 'danger' : 'muted'} onPress={() => onDisconnect(conn)} />
    </View>
  );
};

// 내 정보 › 연결된 기기: Strava 를 연결해 두고 하루 · 기간 · 전체를 골라 운동 기록을 가져온다.
export const Devices = () => {
  const theme = useTheme();
  const params = useLocalSearchParams<{ sync?: string; result?: string }>();

  const [overview, setOverview] = useState<SyncOverview | null>(null);
  const [advanced, setAdvanced] = useState<boolean>(false);
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

  const createDevice = (): Promise<void> =>
    run(async () => {
      setCreated(await api.createDevice(deviceName));
      setDeviceName('');
      await load();
    });

  const disconnect = (conn: SyncConnection): void => {
    if (confirm !== conn.id) {
      setConfirm(conn.id);
      return;
    }
    setConfirm('');
    void run(async () => {
      await api.disconnect(conn.id);
      if (created?.connection.id === conn.id) setCreated(null);
      await load();
      setNotice(`${conn.name} 연결을 끊었어요. 이미 받은 기록은 남아 있어요.`);
    });
  };

  const connections = overview?.connections ?? [];
  const stravaConns = connections.filter((c) => c.provider === 'strava');
  const deviceConns = connections.filter((c) => c.provider === 'device');
  const mono = Platform.OS === 'web' ? 'ui-monospace, Menlo, Consolas, monospace' : undefined;

  return (
    <Card style={{ gap: space(4) }}>
      <SectionTitle
        title="연결된 기기"
        caption="Strava 를 연결하면 날짜를 골라 운동 기록을 가져올 수 있어요. Garmin · 갤럭시워치 · Apple Watch 는 각 앱에서 Strava 자동 업로드를 켜 두면 돼요."
      />

      {stravaConns.map((conn) => (
        <StravaCard key={conn.id} conn={conn} onChanged={load} onDisconnect={disconnect} confirming={confirm === conn.id} />
      ))}

      {stravaConns.length === 0 ? (
        overview?.strava_enabled ? (
          <View style={{ gap: space(2) }}>
            <Button title="Strava 연결" onPress={() => void connectStrava()} disabled={busy} />
            <T variant="caption">Strava 로그인 · 동의 화면에 다녀오면 최근 90일 활동을 바로 가져와요.</T>
          </View>
        ) : (
          <Message text="아직 Strava 연결을 쓸 수 없어요. 관리자가 서버에 Strava 앱 키를 설정하면 연결 버튼이 생겨요." />
        )
      ) : null}

      <Message text={error} tone="error" />
      <Message text={notice} tone="ok" />

      {/* 고급: 폰 자동화가 직접 보내는 방식 */}
      <TextButton title={advanced ? '▾ 고급 · 폰 자동화로 보내기' : '▸ 고급 · 폰 자동화로 보내기'} tone="muted" onPress={() => setAdvanced((v) => !v)} />
      {advanced ? (
        <View style={{ gap: space(3) }}>
          <T variant="caption">
            Strava 를 쓰지 않는다면 폰 자동화(iPhone 단축어, Android 자동화 앱)가 운동이 끝날 때 기록을 이 서버로 보내게 할 수 있어요. 토큰을 만들고 안내된
            주소 · 형식으로 보내도록 자동화를 직접 만들어야 해요.
          </T>

          {deviceConns.map((conn) => (
            <View key={conn.id} style={{ gap: space(1), paddingBottom: space(3), borderBottomWidth: 1, borderBottomColor: theme.line }}>
              <Status conn={conn} />
              <TextButton
                title={confirm === conn.id ? '정말 끊을까요?' : '연결 끊기'}
                tone={confirm === conn.id ? 'danger' : 'muted'}
                onPress={() => disconnect(conn)}
                disabled={busy}
              />
            </View>
          ))}

          {created ? (
            <View style={{ gap: space(2), backgroundColor: theme.field, borderRadius: radius.tile, padding: space(3) }}>
              <T variant="bodyStrong">{created.connection.name} 토큰 · 지금 한 번만 보여요</T>
              <T variant="body" selectable style={{ fontFamily: mono, fontSize: 13 }}>
                {created.token}
              </T>
              <TextButton title="토큰 복사" onPress={() => void copy(created.token).then((ok) => setNotice(ok ? '토큰을 복사했어요.' : '토큰을 길게 눌러 복사하세요.'))} />
              <T variant="caption" color={theme.text} selectable style={{ fontFamily: mono }}>
                {`POST ${created.ingest_url}\nAuthorization: Bearer ${created.token.slice(0, 8)}…\nContent-Type: application/json\n\n{"date":"2026-10-21","type":"running","distance_km":5.2,"duration_min":28.5}`}
              </T>
              <T variant="caption">type: running 은 러닝, strength 는 웨이트, 그 밖은 기타. 같은 기록을 다시 보내도 한 번만 저장돼요.</T>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
            <Field label="기기 이름" value={deviceName} onChangeText={setDeviceName} placeholder="내 아이폰" style={{ flex: 1 }} />
            <View style={{ width: 120 }}>
              <Button title="토큰 만들기" variant="secondary" onPress={() => void createDevice()} disabled={busy} />
            </View>
          </View>
        </View>
      ) : null}
    </Card>
  );
};
