import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button, Field, Message, Screen } from '@/components/ui';
import * as api from '@/api/endpoints';
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
      <ScrollView contentContainerStyle={{ gap: space(3) }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: '700' }}>프로필</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>{user?.email || '소셜 계정'}</Text>

        <Field label="표시 이름" value={displayName} onChangeText={setDisplayName} />
        <Button
          title="프로필 저장"
          onPress={() =>
            void run(async () => {
              await api.updateProfile({ display_name: displayName });
              await refreshUser();
              return '프로필을 저장했습니다.';
            })
          }
        />

        <View style={{ height: 1, backgroundColor: theme.border }} />

        <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>그룹</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12 }}>
          같은 그룹의 구성원은 서로의 지표 차트를 볼 수 있습니다(공유를 끈 구성원은 제외).
        </Text>

        {groups.map((group) => (
          <View
            key={group.id}
            style={{
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: radius,
              backgroundColor: theme.surface,
              padding: space(3),
              gap: space(1),
            }}
          >
            <Text style={{ color: theme.text, fontWeight: '600' }}>{group.name}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>초대 코드 {group.invite_code}</Text>
            <Text style={{ color: theme.textMuted, fontSize: 12 }}>
              {(members[group.id] ?? [])
                .map((m) => `${m.display_name}${m.share_data ? '' : ' (비공개)'}`)
                .join(', ')}
            </Text>
          </View>
        ))}

        <Field label="새 그룹 이름" value={groupName} onChangeText={setGroupName} />
        <Button
          title="그룹 만들기"
          variant="ghost"
          onPress={() =>
            void run(async () => {
              const created = await api.createGroup(groupName);
              setGroupName('');
              return `그룹을 만들었습니다. 초대 코드 ${created.invite_code}`;
            })
          }
        />

        <Field label="초대 코드" value={inviteCode} onChangeText={setInviteCode} />
        <Button
          title="그룹 참여"
          variant="ghost"
          onPress={() =>
            void run(async () => {
              await api.joinGroup(inviteCode);
              setInviteCode('');
              return '그룹에 참여했습니다.';
            })
          }
        />

        <Message text={error} tone="error" />
        <Message text={notice} />

        <View style={{ height: 1, backgroundColor: theme.border }} />

        <Button
          title="로그아웃"
          variant="ghost"
          onPress={() => {
            void signOut().then(() => router.replace('/login'));
          }}
        />
      </ScrollView>
    </Screen>
  );
};

export default Profile;
