import type { ApiError, Session } from '@/types';
import { ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, storage } from '@/api/storage';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8080';

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
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  auth?: boolean;
}

const buildURL = (path: string, query?: RequestOptions['query']): string => {
  const url = new URL(path, API_BASE_URL);
  Object.entries(query ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
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

// 401 을 만나면 refresh 한 번만 시도하고, 실패하면 토큰을 비운다.
let refreshing: Promise<boolean> | null = null;

const refreshSession = (): Promise<boolean> => {
  if (refreshing) return refreshing;

  const pending = (async (): Promise<boolean> => {
    const refreshToken = await storage.get(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;

    const res = await fetch(buildURL('/api/v1/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) {
      await clearTokens();
      return false;
    }

    const session = (await res.json()) as Session;
    await saveTokens(session);
    return true;
  })().finally(() => {
    refreshing = null;
  });

  refreshing = pending;
  return pending;
};

export const saveTokens = async (session: Session): Promise<void> => {
  await storage.set(ACCESS_TOKEN_KEY, session.tokens.access_token);
  await storage.set(REFRESH_TOKEN_KEY, session.tokens.refresh_token);
};

export const clearTokens = async (): Promise<void> => {
  await storage.remove(ACCESS_TOKEN_KEY);
  await storage.remove(REFRESH_TOKEN_KEY);
};

export const getAccessToken = (): Promise<string | null> => storage.get(ACCESS_TOKEN_KEY);

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const { method = 'GET', body, query, auth = true } = options;

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    if (auth) {
      const token = await getAccessToken();
      if (token) headers.Authorization = `Bearer ${token}`;
    }

    return fetch(buildURL(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await send();
  if (res.status === 401 && auth && (await refreshSession())) {
    res = await send();
  }

  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;

  return (await res.json()) as T;
};

export { buildURL };
