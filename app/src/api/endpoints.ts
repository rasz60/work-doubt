import { request } from '@/api/client';
import type {
  BodyMetric,
  Conversation,
  ChatMessage,
  Goal,
  Group,
  GroupMember,
  ListResponse,
  MetricKind,
  MetricSeries,
  User,
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
