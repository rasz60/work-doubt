import { Platform } from 'react-native';

import { supabase } from '@/api/supabase';
import type { ApiError } from '@/types';

// 웹 배포본은 포털과 같은 도메인의 /api/workout (Caddy 가 Go 백엔드로 넘긴다).
// 네이티브 앱·로컬 개발은 EXPO_PUBLIC_API_BASE_URL 로 전체 주소를 준다.
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_BASE_URL ?? (Platform.OS === 'web' ? '/api/workout' : 'http://localhost:8080')
).replace(/\/$/, '');

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, body: ApiError) {
    super(body.message || body.error);
    this.status = status;
    this.code = body.error;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
}

// API_BASE_URL 에 경로가 붙어 있을 수 있어(/api/workout) new URL(path, base) 대신 이어 붙인다.
const buildURL = (path: string, query?: RequestOptions['query']): string => {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') params.set(key, String(value));
  });
  const qs = params.toString();
  return `${API_BASE_URL}${path}${qs ? `?${qs}` : ''}`;
};

const parseError = async (res: Response): Promise<HttpError> => {
  const fallback: ApiError = { error: 'unknown', message: `HTTP ${res.status}` };
  try {
    const body = (await res.json()) as ApiError;
    return new HttpError(res.status, body.error ? body : fallback);
  } catch {
    return new HttpError(res.status, fallback);
  }
};

/** Supabase 세션의 access token. 만료가 가까우면 supabase-js 가 알아서 갱신해 준다 */
export const getAccessToken = async (): Promise<string | null> => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
};

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, query } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = await getAccessToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    return fetch(buildURL(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await send();
  // 토큰이 막 만료된 경우: 한 번만 갱신해서 다시 보낸다
  if (res.status === 401 && !(await supabase.auth.refreshSession()).error) {
    res = await send();
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
};

export { buildURL };
