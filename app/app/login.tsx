import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';

import { goToPortalLogin, usesPortalLogin } from '@/api/supabase';
import { Button, Field, Heading, Message, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { space, tracking, useTheme } from '@/theme';

// 웹 배포본은 ae:p 포털에서 로그인한다 (이 화면은 포털로 넘기기만 한다).
// 네이티브 앱과 개발 서버는 같은 ae:p 계정(Supabase)으로 여기서 로그인한다. 가입은 포털의 초대로만.
const Login = () => {
  const theme = useTheme();
  const { signIn } = useAuth();

  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  useEffect(() => {
    if (usesPortalLogin) goToPortalLogin();
  }, []);

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
      <ScrollView
        contentContainerStyle={{ gap: space(5), paddingBottom: space(6) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* 워드마크: 로고 이미지 없이 굵은 대문자 타이포만으로 브랜드를 만든다. */}
        <View style={{ paddingTop: space(10), paddingBottom: space(6), gap: space(2) }}>
          <Text style={{ color: theme.text, fontSize: 48, fontWeight: '900', letterSpacing: tracking.tight }}>
            NO-WORK-DOUBT.
          </Text>
          <View style={{ height: 2, width: space(10), backgroundColor: theme.text }} />
        </View>

        <Heading eyebrow="Sign In" title="로그인" caption="ae:p 계정으로 로그인합니다. 계정은 초대로만 만들 수 있어요." />

        <Field label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry />

        <Message text={error} tone="error" />

        <Button title="SIGN IN" onPress={() => void submit()} disabled={busy} />
      </ScrollView>
    </Screen>
  );
};

export default Login;
