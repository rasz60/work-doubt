import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import * as api from '@/api/endpoints';
import { goToPortalLogin, supabase, usesPortalLogin } from '@/api/supabase';
import type { User } from '@/types';

interface AuthState {
  /** Supabase 로그인 여부 */
  signedIn: boolean;
  /** 이 앱의 프로필 (백엔드 /me). 로그인했는데 못 불러오면 error 에 이유가 담긴다 */
  user: User | null;
  loading: boolean;
  error: string;
  /** 네이티브·개발용 로그인. 웹 배포본은 포털에서 로그인한다 */
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined); // undefined = 아직 모름
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    setError('');
    try {
      setUser(await api.fetchMe());
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : '프로필을 불러오지 못했습니다.');
    }
  }, []);

  // 로그인한 사용자가 바뀔 때만 프로필을 다시 불러온다 (토큰 갱신마다 부르지 않게 id 로 비교)
  const userId = session?.user.id;
  useEffect(() => {
    if (session === undefined) return;
    if (!userId) {
      setUser(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void refreshUser().finally(() => setLoading(false));
  }, [session === undefined, userId, refreshUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const signIn = useCallback(async (email: string, password: string): Promise<void> => {
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      throw new Error(/invalid/i.test(signInError.message) ? '이메일 또는 비밀번호가 맞지 않습니다.' : signInError.message);
    }
  }, []);

  const signOut = useCallback(async (): Promise<void> => {
    // 웹 배포본은 포털에서 로그아웃한다 (같은 세션을 쓰는 모든 앱이 함께 로그아웃된다)
    if (usesPortalLogin) return goToPortalLogin(true);
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ signedIn: !!session, user, loading: loading || session === undefined, error, signIn, signOut, refreshUser }),
    [session, user, loading, error, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};
