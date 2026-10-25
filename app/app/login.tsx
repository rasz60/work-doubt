import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { goToPortalLogin, usesPortalLogin } from '@/api/supabase';
import { Button, Card, Field, Message, Page, Screen, SectionTitle, T } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { space, useTheme } from '@/theme';

// 웹 배포본은 ae:p 포털에서 로그인한다 (이 화면은 포털로 넘기기만 한다).
// 네이티브 앱과 개발 서버는 같은 ae:p 계정(Supabase)으로 여기서 로그인한다. 가입은 포털의 초대로만.
const Login = () => {
  const theme = useTheme();
  const { signIn, signedIn, loading } = useAuth();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  // 세션이 있는데 이 화면에 왔으면(포털 로그인에서 돌아온 경우 등) 포털로 다시 보내지 않고 탭으로 간다.
  // 세션을 확인하기 전에 포털로 보내면 포털 ↔ 이 화면을 무한히 왕복한다
  useEffect(() => {
    if (usesPortalLogin && !loading && !signedIn) goToPortalLogin();
  }, [loading, signedIn]);

  if (signedIn && !loading) return <Redirect href="/(tabs)" />;

  if (usesPortalLogin) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    );
  }

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Page>
        {/* 워드마크: 전광판 숫자체로 쓴 앱 이름 + 세 가지 운동 색 */}
        <View style={{ paddingTop: space(12), paddingBottom: space(4), gap: space(3) }}>
          <T variant="numXl" style={{ fontSize: 56, lineHeight: 58 }}>
            NO-WORK-DOUBT.
          </T>
          <View style={{ flexDirection: 'row', gap: space(1.5) }}>
            {[theme.run.solid, theme.weight.solid, theme.other.solid].map((c) => (
              <View key={c} style={{ width: space(8), height: 4, borderRadius: 2, backgroundColor: c }} />
            ))}
          </View>
        </View>

        <Card style={{ gap: space(4) }}>
          <SectionTitle title="로그인" caption="ae:p 계정으로 로그인해요. 계정은 초대로만 만들 수 있어요." />
          <Field label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry />
          <Message text={error} tone="error" />
          <Button title={busy ? '로그인하는 중…' : '로그인'} onPress={() => void submit()} disabled={busy} />
        </Card>
      </Page>
    </Screen>
  );
};

export default Login;
