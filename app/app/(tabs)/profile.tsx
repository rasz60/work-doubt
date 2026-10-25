import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';

import { Button, Card, Field, Heading, Message, Page, Screen, SectionTitle, T } from '@/components/ui';
import * as api from '@/api/endpoints';
import { Devices } from '@/features/profile/Devices';
import { useAuth } from '@/hooks/useAuth';
import { radius, space, useTheme } from '@/theme';
import type { Group, GroupMember } from '@/types';

// 프로필 + 그룹(계정 간 데이터 공유) 관리.
const Profile = () => {
  const theme = useTheme();
  const { user, signOut, refreshUser } = useAuth();

  const [displayName, setDisplayName] = useState<string>(user?.display_name ?? '');
  const [groups, setGroups] = useState<Group[]>([]);
  const [members, setMembers] = useState<Record<string, GroupMember[]>>({});
  const [groupName, setGroupName] = useState<string>('');
  const [inviteCode, setInviteCode] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [error, setError] = useState<string>('');

  const loadGroups = useCallback(async (): Promise<void> => {
    try {
      const { items } = await api.fetchGroups();
      setGroups(items);

      const entries = await Promise.all(
        items.map(async (group) => [group.id, (await api.fetchGroupMembers(group.id)).items] as const),
      );
      setMembers(Object.fromEntries(entries));
    } catch (err) {
      setError(err instanceof Error ? err.message : '그룹을 불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void loadGroups();
  }, [loadGroups]);

  const run = async (action: () => Promise<string>): Promise<void> => {
    setError('');
    setNotice('');
    try {
      setNotice(await action());
      await loadGroups();
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
    }
  };

  return (
    <Screen>
      <Page>
        <Heading title={user?.display_name || '내 정보'} caption={user?.email || ''} />

        <Card>
          <SectionTitle title="프로필" />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
            <Field label="표시 이름" value={displayName} onChangeText={setDisplayName} style={{ flex: 1 }} />
            <View style={{ width: 88 }}>
              <Button
                title="저장"
                variant="secondary"
                onPress={() =>
                  void run(async () => {
                    await api.updateProfile({ display_name: displayName });
                    await refreshUser();
                    return '프로필을 저장했어요.';
                  })
                }
              />
            </View>
          </View>
        </Card>

        <Devices />

        <Card>
          <SectionTitle title="그룹" caption="같은 그룹 사람끼리 서로의 지표 차트를 볼 수 있어요 (공유를 끈 사람은 빼고)." />

          {groups.map((group) => (
            <View key={group.id} style={{ gap: space(1), paddingVertical: space(3), borderTopWidth: 1, borderTopColor: theme.line }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space(2) }}>
                <T variant="bodyStrong" style={{ flex: 1 }} numberOfLines={1}>
                  {group.name}
                </T>
                <View style={{ backgroundColor: theme.field, borderRadius: radius.box, paddingHorizontal: space(2), paddingVertical: 2 }}>
                  <T variant="numSm" selectable>
                    {group.invite_code}
                  </T>
                </View>
              </View>
              <T variant="caption">
                {(members[group.id] ?? []).map((m) => `${m.display_name}${m.share_data ? '' : ' (비공개)'}`).join(', ')}
              </T>
            </View>
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
            <Field label="새 그룹 만들기" value={groupName} onChangeText={setGroupName} placeholder="그룹 이름" style={{ flex: 1 }} />
            <View style={{ width: 88 }}>
              <Button
                title="만들기"
                variant="secondary"
                disabled={!groupName.trim()}
                onPress={() =>
                  void run(async () => {
                    const created = await api.createGroup(groupName);
                    setGroupName('');
                    return `그룹을 만들었어요. 초대 코드 ${created.invite_code}`;
                  })
                }
              />
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
            <Field label="초대 코드로 참여" value={inviteCode} onChangeText={setInviteCode} placeholder="코드" style={{ flex: 1 }} />
            <View style={{ width: 88 }}>
              <Button
                title="참여"
                variant="secondary"
                disabled={!inviteCode.trim()}
                onPress={() =>
                  void run(async () => {
                    await api.joinGroup(inviteCode);
                    setInviteCode('');
                    return '그룹에 참여했어요.';
                  })
                }
              />
            </View>
          </View>

          <Message text={error} tone="error" />
          <Message text={notice} tone="ok" />
        </Card>

        <Button
          title="로그아웃"
          variant="secondary"
          onPress={() => {
            void signOut().then(() => router.replace('/login'));
          }}
        />
      </Page>
    </Screen>
  );
};

export default Profile;
