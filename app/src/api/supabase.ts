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

/** 포털 로그인으로 보낸다. 로그인 뒤 지금 주소로 돌아온다 */
export const goToPortalLogin = (logout = false): void => {
  const next = encodeURIComponent(window.location.pathname + window.location.search);
  window.location.replace(logout ? '/login?logout=1' : `/login?next=${next}`);
};
