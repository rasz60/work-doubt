import { request } from '@/api/client';
import type {
  ActivitySummary,
  BodyMetric,
  CalendarDay,
  Conversation,
  ChatMessage,
  CreatedDevice,
  ImportResult,
  Goal,
  Group,
  GroupMember,
  ListResponse,
  MetricKind,
  MetricSeries,
  Plan,
  PlanDay,
  Session,
  SessionSet,
  SyncOverview,
  User,
  WorkoutKind,
} from '@/types';

// ── 계정 (로그인은 ae:p 포털 · Supabase Auth) ───────────────

export const fetchMe = (): Promise<User> => request<User>('/api/v1/me');

export const updateProfile = (patch: {
  display_name?: string;
  avatar_url?: string;
  height_cm?: number | null;
}): Promise<User> => request<User>('/api/v1/me', { method: 'PATCH', body: patch });

// ── 신체 지표 ────────────────────────────────────────────

export interface RecordMetricPayload {
  measured_at?: string;
  height_cm?: number;
  weight_kg?: number;
  skeletal_muscle_kg?: number;
  body_fat_percentage?: number;
  memo?: string;
}

export const recordMetric = (payload: RecordMetricPayload): Promise<BodyMetric> =>
  request<BodyMetric>('/api/v1/metrics', { method: 'POST', body: payload });

export const fetchLatestMetric = (): Promise<BodyMetric> =>
  request<BodyMetric>('/api/v1/metrics/latest');

export const fetchMetricHistory = (from?: string, to?: string): Promise<ListResponse<BodyMetric>> =>
  request<ListResponse<BodyMetric>>('/api/v1/metrics', { query: { from, to } });

export const fetchMetricSeries = (
  kind: MetricKind,
  options: { from?: string; to?: string; userId?: string } = {},
): Promise<MetricSeries> =>
  request<MetricSeries>('/api/v1/metrics/series', {
    query: { kind, from: options.from, to: options.to, user_id: options.userId },
  });

// ── 그룹 ────────────────────────────────────────────────

export const createGroup = (name: string): Promise<Group> =>
  request<Group>('/api/v1/groups', { method: 'POST', body: { name } });

export const fetchGroups = (): Promise<ListResponse<Group>> =>
  request<ListResponse<Group>>('/api/v1/groups');

export const joinGroup = (inviteCode: string, shareData = true): Promise<Group> =>
  request<Group>('/api/v1/groups/join', {
    method: 'POST',
    body: { invite_code: inviteCode, share_data: shareData },
  });

export const fetchGroupMembers = (groupId: string): Promise<ListResponse<GroupMember>> =>
  request<ListResponse<GroupMember>>(`/api/v1/groups/${groupId}/members`);

// ── AI 코치 ──────────────────────────────────────────────

export const startConversation = (goal: Goal, title: string): Promise<Conversation> =>
  request<Conversation>('/api/v1/coach/conversations', {
    method: 'POST',
    body: { goal, title },
  });

export const fetchConversations = (): Promise<ListResponse<Conversation>> =>
  request<ListResponse<Conversation>>('/api/v1/coach/conversations');

export const fetchMessages = (conversationId: string): Promise<ListResponse<ChatMessage>> =>
  request<ListResponse<ChatMessage>>(`/api/v1/coach/conversations/${conversationId}/messages`);

// ── 운동 계획 (주간 루틴, 고칠 때마다 새 버전) ─────────────────

export interface SavePlanPayload {
  effective_from: string;
  title: string;
  days: PlanDay[];
}

/** 최신 버전부터 */
export const fetchPlans = (): Promise<ListResponse<Plan>> => request<ListResponse<Plan>>('/api/v1/plans');

export const savePlan = (payload: SavePlanPayload): Promise<Plan> =>
  request<Plan>('/api/v1/plans', { method: 'POST', body: payload });

export const deletePlan = (id: string): Promise<void> => request<void>(`/api/v1/plans/${id}`, { method: 'DELETE' });

// ── 수행 기록 ────────────────────────────────────────────

export interface SessionPayload {
  performed_on: string;
  kind: WorkoutKind;
  title?: string;
  distance_km?: number;
  duration_sec?: number;
  calories_kcal?: number;
  avg_heart_rate?: number;
  memo?: string;
  sets?: SessionSet[];
}

export const fetchSessions = (from?: string, to?: string): Promise<ListResponse<Session>> =>
  request<ListResponse<Session>>('/api/v1/sessions', { query: { from, to } });

export const createSession = (payload: SessionPayload): Promise<Session> =>
  request<Session>('/api/v1/sessions', { method: 'POST', body: payload });

export const updateSession = (id: string, payload: SessionPayload): Promise<Session> =>
  request<Session>(`/api/v1/sessions/${id}`, { method: 'PUT', body: payload });

export const deleteSession = (id: string): Promise<void> =>
  request<void>(`/api/v1/sessions/${id}`, { method: 'DELETE' });

// ── 잔디 · 통계 ─────────────────────────────────────────

export const fetchCalendar = (from: string, to: string): Promise<ListResponse<CalendarDay>> =>
  request<ListResponse<CalendarDay>>('/api/v1/activity/calendar', { query: { from, to } });

/** month: YYYY-MM (비우면 이번 달) */
export const fetchActivitySummary = (month?: string): Promise<ActivitySummary> =>
  request<ActivitySummary>('/api/v1/activity/summary', { query: { month } });

// ── 기기 · 앱 연동 ───────────────────────────────────────

export const fetchSync = (): Promise<SyncOverview> => request<SyncOverview>('/api/v1/sync');

/** Strava 에서 새 활동을 가져온다. force 가 아니면 10분에 한 번만 실제로 가져온다 */
export const runSync = (force = false): Promise<SyncOverview> =>
  request<SyncOverview>('/api/v1/sync/run', { method: 'POST', body: { force } });

export const fetchStravaAuthorizeURL = (): Promise<{ url: string }> =>
  request<{ url: string }>('/api/v1/sync/strava/authorize');

export const createDevice = (name: string): Promise<CreatedDevice> =>
  request<CreatedDevice>('/api/v1/sync/devices', { method: 'POST', body: { name } });

/** 날짜(from = to) · 기간 · 전체(둘 다 비움)의 활동을 가져온다. 이미 있는 기록은 건너뛴다 */
export const importConnection = (id: string, from?: string, to?: string): Promise<ImportResult> =>
  request<ImportResult>(`/api/v1/sync/connections/${id}/import`, { method: 'POST', body: { from: from ?? '', to: to ?? '' } });

export const disconnect = (id: string): Promise<void> =>
  request<void>(`/api/v1/sync/connections/${id}`, { method: 'DELETE' });
