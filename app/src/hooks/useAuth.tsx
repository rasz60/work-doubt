import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { clearTokens, getAccessToken, saveTokens } from '@/api/client';
import * as api from '@/api/endpoints';
import type { Provider, Session, User } from '@/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signInWithSocial: (
    provider: Exclude<Provider, 'local'>,
    code: string,
    redirectURL: string,
  ) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const adopt = useCallback(async (session: Session): Promise<void> => {
    await saveTokens(session);
    setUser(session.user);
  }, []);

  const refreshUser = useCallback(async (): Promise<void> => {
    const token = await getAccessToken();
    if (!token) {
      setUser(null);
      return;
    }
    try {
      setUser(await api.fetchMe());
    } catch {
      await clearTokens();
      setUser(null);
    }
  }, []);

  // 앱 시작 시 저장된 토큰으로 세션을 복원한다.
  useEffect(() => {
    void refreshUser().finally(() => setLoading(false));
  }, [refreshUser]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      await adopt(await api.login(email, password));
    },
    [adopt],
  );

  const signUp = useCallback(
    async (email: string, password: string, displayName: string): Promise<void> => {
      await adopt(await api.register(email, password, displayName));
    },
    [adopt],
  );

  const signInWithSocial = useCallback(
    async (
      provider: Exclude<Provider, 'local'>,
      code: string,
      redirectURL: string,
    ): Promise<void> => {
      await adopt(await api.socialLogin(provider, code, redirectURL));
    },
    [adopt],
  );

  const signOut = useCallback(async (): Promise<void> => {
    try {
      await api.logout();
    } finally {
      await clearTokens();
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signUp, signInWithSocial, signOut, refreshUser }),
    [user, loading, signIn, signUp, signInWithSocial, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthState => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
};
