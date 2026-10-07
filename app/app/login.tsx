import React, { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { Button, Field, Message, Screen } from '@/components/ui';
import { useAuth } from '@/hooks/useAuth';
import { space, useTheme } from '@/theme';
import type { Provider } from '@/types';

type SocialProvider = Exclude<Provider, 'local'>;

const SOCIAL_LABELS: Record<SocialProvider, string> = {
  google: 'Google 로 계속하기',
  kakao: '카카오로 계속하기',
  naver: '네이버로 계속하기',
};

// 공급자별 authorize 엔드포인트. client_id 는 EXPO_PUBLIC_* 로 주입한다.
const AUTHORIZE_URL: Record<SocialProvider, string> = {
  google: 'https://accounts.google.com/o/oauth2/v2/auth',
  kakao: 'https://kauth.kakao.com/oauth/authorize',
  naver: 'https://nid.naver.com/oauth2.0/authorize',
};

const CLIENT_IDS: Record<SocialProvider, string | undefined> = {
  google: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID,
  kakao: process.env.EXPO_PUBLIC_KAKAO_CLIENT_ID,
  naver: process.env.EXPO_PUBLIC_NAVER_CLIENT_ID,
};

const Login = () => {
  const theme = useTheme();
  const { signIn, signUp, signInWithSocial } = useAuth();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [displayName, setDisplayName] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await signIn(email, password);
      } else {
        await signUp(email, password, displayName);
      }
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  /**
   * 소셜 로그인: 공급자 인증 화면을 띄우고 돌아온 authorization code 를 백엔드에 넘긴다.
   * 코드 → 토큰 교환은 서버에서만 수행한다(client secret 을 클라이언트에 두지 않는다).
   */
  const startSocial = async (provider: SocialProvider): Promise<void> => {
    const clientId = CLIENT_IDS[provider];
    if (!clientId) {
      setError(`${provider} client id 가 설정되지 않았습니다.`);
      return;
    }

    const redirectURL = Linking.createURL(`/auth/callback/${provider}`);
    const authorize = new URL(AUTHORIZE_URL[provider]);
    authorize.searchParams.set('client_id', clientId);
    authorize.searchParams.set('redirect_uri', redirectURL);
    authorize.searchParams.set('response_type', 'code');
    authorize.searchParams.set('state', String(Date.now()));
    if (provider === 'google') {
      authorize.searchParams.set('scope', 'openid email profile');
    }

    setError('');
    try {
      const result = await WebBrowser.openAuthSessionAsync(authorize.toString(), redirectURL);
      if (result.type !== 'success') return;

      const code = new URL(result.url).searchParams.get('code');
      if (!code) {
        setError('authorization code 를 받지 못했습니다.');
        return;
      }
      await signInWithSocial(provider, code, redirectURL);
      router.replace('/(tabs)');
    } catch (err) {
      setError(err instanceof Error ? err.message : '소셜 로그인에 실패했습니다.');
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ gap: space(3) }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: theme.text, fontSize: 24, fontWeight: '700' }}>
          {mode === 'login' ? '로그인' : '계정 만들기'}
        </Text>

        <Field label="이메일" value={email} onChangeText={setEmail} keyboardType="email-address" />
        <Field label="비밀번호" value={password} onChangeText={setPassword} secureTextEntry />
        {mode === 'register' && (
          <Field label="표시 이름" value={displayName} onChangeText={setDisplayName} />
        )}

        <Message text={error} tone="error" />

        <Button
          title={mode === 'login' ? '로그인' : '가입하기'}
          onPress={() => void submit()}
          disabled={busy}
        />
        <Button
          title={mode === 'login' ? '계정이 없으신가요? 가입' : '이미 계정이 있습니다'}
          variant="ghost"
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
        />

        <View style={{ height: 1, backgroundColor: theme.border, marginVertical: space(2) }} />

        {(Object.keys(SOCIAL_LABELS) as SocialProvider[]).map((provider) => (
          <Button
            key={provider}
            title={SOCIAL_LABELS[provider]}
            variant="ghost"
            onPress={() => void startSocial(provider)}
          />
        ))}

        {Platform.OS === 'web' && (
          <Message text="웹에서는 공급자 콘솔에 현재 주소를 리디렉트 URI 로 등록해야 합니다." />
        )}
      </ScrollView>
    </Screen>
  );
};

export default Login;
