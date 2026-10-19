import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

// 로그인은 ae:p 포털(Supabase Auth)이 한다. 웹은 포털과 같은 도메인이라 포털의 세션(localStorage)을 그대로 쓰고,
// 네이티브 앱은 이 앱의 로그인 화면에서 같은 계정으로 로그인해 AsyncStorage 에 세션을 둔다.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** 웹 배포본은 포털 아래(/workout/)에서 돈다. 개발 서버(expo start)는 포털이 없어 자체 로그인 화면을 쓴다 */
export const usesPortalLogin = Platform.OS === 'web' && !__DEV__;

/** 웹 배포본의 앱 루트 (app.json experiments.baseUrl) */
const WEB_BASE = '/workout/';

/**
 * 포털 로그인 뒤 돌아올 주소. 이 앱의 /login 화면으로 돌아오면 또 포털로 보내 무한히 왕복하므로 앱 루트로 바꾸고,
 * 끝 / 가 없는 앱 루트(/workout)는 포털이 다른 앱 주소로 알아보지 못하므로 /workout/ 으로 맞춘다
 */
export const portalReturnPath = (pathname: string, search: string): string => {
  const root = WEB_BASE.replace(/\/$/, '');
  if (pathname === root || /\/login\/?$/.test(pathname)) return WEB_BASE;
  return pathname + search;
};

/** 포털 로그인으로 보낸다. 로그인 뒤 지금 주소로 돌아온다 */
export const goToPortalLogin = (logout = false): void => {
  const next = encodeURIComponent(portalReturnPath(window.location.pathname, window.location.search));
  window.location.replace(logout ? '/login?logout=1' : `/login?next=${next}`);
};
