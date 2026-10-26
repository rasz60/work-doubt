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

// ── 운동 계획 · 수행 기록 ───────────────────────────────

export type WorkoutKind = 'run' | 'weight' | 'other';
export type PlanKind = 'run' | 'weight' | 'rest';

export interface PlannedExercise {
  name: string;
  sets: number;
  reps: number;
  weight_kg?: number;
}

/** 요일 하나의 계획. weekday 는 1=월 … 7=일 */
export interface PlanDay {
  weekday: number;
  kind: PlanKind;
  distance_km?: number;
  pace_sec_per_km?: number;
  exercises?: PlannedExercise[];
  target_kcal?: number;
}

/** 주간 루틴의 한 버전. effective_from 부터 다음 버전 전날까지 적용된다 */
export interface Plan {
  id: string;
  user_id: string;
  effective_from: string;
  title: string;
  days: PlanDay[];
  created_at: string;
}

export interface SessionSet {
  exercise: string;
  weight_kg?: number;
  reps: number;
}

export type SessionSource = 'manual' | 'strava' | 'device' | 'apple_health';

export interface Session {
  id: string;
  user_id: string;
  performed_on: string;
  kind: WorkoutKind;
  title: string;
  distance_km?: number;
  duration_sec?: number;
  calories_kcal?: number;
  avg_heart_rate?: number;
  memo?: string;
  source: SessionSource;
  connection_id?: string;
  sets: SessionSet[];
  created_at: string;
  updated_at: string;
}

export type DayStatus = 'rest' | 'planned' | 'done' | 'partial' | 'missed' | 'extra';

/** 잔디 한 칸 */
export interface CalendarDay {
  date: string;
  weekday: number;
  planned?: PlanDay;
  sessions: Session[];
  status: DayStatus;
  achievement: number;
  level: number;
}

export interface KcalSummary {
  target: number;
  target_to_date: number;
  actual: number;
}

export interface RunStats {
  count: number;
  total_km: number;
  avg_distance_km: number;
  avg_pace_sec: number;
  best_pace_sec: number;
  vdot: number;
  target_pace_sec?: number;
  target_distance_km?: number;
}

export interface ExerciseStat {
  name: string;
  last_date: string;
  top_weight_kg: number;
  top_reps: number;
  sets: number;
  estimated_1rm: number;
  delta_1rm: number;
  series: MetricPoint[];
}

export interface PerformanceSeries {
  kind: 'vdot' | 'pace_sec' | 'weekly_km';
  points: MetricPoint[];
  stats: SeriesStats;
}

export interface ActivitySummary {
  today: string;
  month: string;
  body_weight_kg: number;
  weight_assumed: boolean;
  today_kcal: KcalSummary;
  month_kcal: KcalSummary;
  planned_days: number;
  done_days: number;
  run: RunStats;
  run_series: PerformanceSeries[];
  exercises: ExerciseStat[];
  current_plan_id?: string;
  has_any_sessions: boolean;
}

// ── 기기 · 앱 연동 ───────────────────────────────

export type SyncProvider = 'strava' | 'device' | 'apple_health';

export interface SyncConnection {
  id: string;
  user_id: string;
  provider: SyncProvider;
  name: string;
  external_account_id?: string;
  last_synced_at?: string;
  last_error?: string;
  created_at: string;
}

export interface SyncOverview {
  strava_enabled: boolean;
  ingest_url: string;
  connections: SyncConnection[];
}

/** 연동 기록 가져오기 결과 */
export interface ImportResult {
  fetched: number;
  saved: number;
  duplicates: number;
  skipped: number;
  errors?: string[];
}

/** 폰이 보낸 운동 기록 하나 (기기 토큰 ingest · Apple 건강 공통 형식) */
export interface IngestWorkout {
  id: string;
  date: string;
  start?: string;
  type: string;
  title?: string;
  distance_m?: number;
  duration_sec?: number;
  calories_kcal?: number;
  avg_heart_rate?: number;
}

export interface CreatedDevice {
  connection: SyncConnection;
  token: string;
  ingest_url: string;
}

export interface ApiError {
  error: string;
  message: string;
}

export interface ListResponse<T> {
  items: T[];
}

export const KIND_LABELS: Record<WorkoutKind | PlanKind, string> = {
  run: '러닝',
  weight: '웨이트',
  other: '기타',
  rest: '휴식',
};

export const SOURCE_LABELS: Record<SessionSource, string> = {
  manual: '직접',
  strava: 'Strava',
  device: '기기',
  apple_health: 'Apple 건강',
};

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
