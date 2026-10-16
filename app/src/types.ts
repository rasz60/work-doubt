// 백엔드 JSON 스키마와 1:1 로 대응하는 타입. 필드명은 서버의 snake_case 를 그대로 쓴다.

export type MetricKind =
  | 'weight_kg'
  | 'height_cm'
  | 'skeletal_muscle_kg'
  | 'body_fat_percentage'
  | 'bmi';

export type Goal = 'fat_loss' | 'muscle_gain' | 'endurance' | 'maintenance' | 'rehab';

export interface User {
  id: string;
  email: string;
  display_name: string;
  avatar_url?: string;
  height_cm?: number;
  created_at: string;
  updated_at: string;
}

export interface BodyMetric {
  id: string;
  user_id: string;
  measured_at: string;
  height_cm?: number;
  weight_kg?: number;
  skeletal_muscle_kg?: number;
  body_fat_percentage?: number;
  bmi?: number;
  memo?: string;
  created_at: string;
}

export interface MetricPoint {
  measured_at: string;
  value: number;
}

export interface SeriesStats {
  first: number;
  last: number;
  min: number;
  max: number;
  delta: number;
}

export interface MetricSeries {
  kind: MetricKind;
  points: MetricPoint[];
  stats: SeriesStats;
}

export interface Group {
  id: string;
  name: string;
  owner_id: string;
  invite_code: string;
  created_at: string;
}

export interface GroupMember {
  group_id: string;
  user_id: string;
  display_name: string;
  avatar_url?: string;
  role: 'owner' | 'member';
  share_data: boolean;
  joined_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  goal: Goal;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface ListResponse<T> {
  items: T[];
}

export const METRIC_LABELS: Record<MetricKind, string> = {
  weight_kg: '체중 (kg)',
  height_cm: '키 (cm)',
  skeletal_muscle_kg: '골격근량 (kg)',
  body_fat_percentage: '체지방률 (%)',
  bmi: 'BMI',
};

export const GOAL_LABELS: Record<Goal, string> = {
  fat_loss: '체지방 감량',
  muscle_gain: '근육량 증가',
  endurance: '지구력 향상',
  maintenance: '체형 유지',
  rehab: '재활 / 통증 관리',
};
