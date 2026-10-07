import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// 토큰 저장소. 네이티브는 SecureStore, 웹은 localStorage 를 쓴다.
interface TokenStorage {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
}

const webStorage: TokenStorage = {
  get: async (key) => {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  set: async (key, value) => {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // 프라이빗 모드 등에서 실패할 수 있다. 세션은 메모리에만 유지된다.
    }
  },
  remove: async (key) => {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // noop
    }
  },
};

const nativeStorage: TokenStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};

export const storage: TokenStorage = Platform.OS === 'web' ? webStorage : nativeStorage;

export const ACCESS_TOKEN_KEY = 'workout.access_token';
export const REFRESH_TOKEN_KEY = 'workout.refresh_token';
