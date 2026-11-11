import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Group, Header, Message, Page, Screen, T } from '@/components/ui';
import * as api from '@/api/endpoints';
import { radius, space, useTheme } from '@/theme';
import type { Group as GroupType, GroupMember } from '@/types';

type Mode = 'none' | 'create' | 'join';

// 그룹: 같은 그룹 사람끼리 서로의 지표 차트를 본다. "새 그룹" · "코드로 참여"를 누르면 그 입력 하나만 열린다.
const Groups = () => {
  const theme = useTheme();
  const [groups, setGroups] = useState<GroupType[]>([]);
  const [members, setMembers] = useState<Record<string, GroupMember[]>>({});
  const [mode, setMode] = useState<Mode>('none');
  const [text, setText] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  const load = useCallback(async (): Promise<void> => {
    try {
      const { items } = await api.fetchGroups();
      setGroups(items);
      const entries = await Promise.all(items.map(async (g) => [g.id, (await api.fetchGroupMembers(g.id)).items] as const));
      setMembers(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : '그룹을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = (next: Mode): void => {
    setMode(mode === next ? 'none' : next);
    setText('');
    setError('');
  };

  const submit = async (): Promise<void> => {
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (mode === 'create') {
        const created = await api.createGroup(text.trim());
        setNotice(`그룹을 만들었어요. 초대 코드는 ${created.invite_code} 예요.`);
      } else {
        await api.joinGroup(text.trim());
        setNotice('그룹에 참여했어요.');
      }
      setMode('none');
      setText('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Page>
        <Header back="뒤로" fallback="/me" title="그룹" />
        <T variant="caption">같은 그룹 사람끼리 서로의 지표 차트를 볼 수 있어요 (공유를 끈 사람은 빼고).</T>

        {groups.length === 0 ? <Message text="아직 참여한 그룹이 없어요." /> : null}
        {groups.map((g) => (
          <Group key={g.id} style={{ gap: space(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <T variant="heading" style={{ flex: 1 }} numberOfLines={1}>
                {g.name}
              </T>
              <View style={{ backgroundColor: theme.field, borderWidth: 3, borderColor: theme.outline, paddingHorizontal: space(3), paddingVertical: space(1) }}>
                <T variant="numSm" selectable>
                  {g.invite_code}
                </T>
              </View>
            </View>
            <T variant="caption">{(members[g.id] ?? []).map((m) => `${m.display_name}${m.share_data ? '' : ' (비공개)'}`).join(', ') || '구성원을 불러오는 중…'}</T>
          </Group>
        ))}

        <View style={{ flexDirection: 'row', gap: space(2) }}>
          <Button title="새 그룹" variant={mode === 'create' ? 'primary' : 'secondary'} onPress={() => open('create')} style={{ flex: 1 }} />
          <Button title="코드로 참여" variant={mode === 'join' ? 'primary' : 'secondary'} onPress={() => open('join')} style={{ flex: 1 }} />
        </View>

        {mode !== 'none' ? (
          <View style={{ gap: space(3) }}>
            <Field
              label={mode === 'create' ? '그룹 이름' : '초대 코드'}
              value={text}
              onChangeText={setText}
              placeholder={mode === 'create' ? '러닝 크루' : '코드'}
              autoFocus
              onSubmitEditing={() => void submit()}
            />
            <Button title={busy ? '보내는 중…' : mode === 'create' ? '만들기' : '참여하기'} onPress={() => void submit()} disabled={busy || !text.trim()} />
          </View>
        ) : null}

        <Message text={error} tone="error" />
        <Message text={notice} tone="ok" />
      </Page>
    </Screen>
  );
};

export default Groups;
