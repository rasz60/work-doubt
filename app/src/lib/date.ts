// 날짜는 서버와 YYYY-MM-DD 문자열로 주고받는다. 시각이 없으므로 모두 기기 현지 날짜로 계산한다
// (toISOString 은 UTC 라 한국 오전 9시 전에는 하루 전 날짜가 된다).

const pad = (n: number): string => String(n).padStart(2, '0');

export const toDateString = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const todayString = (): string => toDateString(new Date());

/** YYYY-MM-DD → 현지 자정 Date */
export const parseDate = (s: string): Date => {
  const [y = 1970, m = 1, d = 1] = s.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const isDateString = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime());

export const addDays = (s: string, n: number): string => {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return toDateString(d);
};

/** 1=월 … 7=일 */
export const isoWeekday = (s: string): number => {
  const w = parseDate(s).getDay();
  return w === 0 ? 7 : w;
};

export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

export const weekdayLabel = (weekday: number): string => WEEKDAY_LABELS[weekday - 1] ?? '';

/** 그 주 월요일 */
export const startOfWeek = (s: string): string => addDays(s, -(isoWeekday(s) - 1));

export const monthOf = (s: string): string => s.slice(0, 7);

export const startOfMonth = (month: string): string => `${month}-01`;

export const endOfMonth = (month: string): string => {
  const d = parseDate(startOfMonth(month));
  return toDateString(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

export const addMonths = (month: string, n: number): string => {
  const d = parseDate(startOfMonth(month));
  return toDateString(new Date(d.getFullYear(), d.getMonth() + n, 1)).slice(0, 7);
};

/** 2026-10-21 → 10월 21일 (수) */
export const formatLongDate = (s: string): string => {
  const d = parseDate(s);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdayLabel(isoWeekday(s))})`;
};

/** 2026-10-21 → 10.21 */
export const formatShortDate = (s: string): string => `${Number(s.slice(5, 7))}.${Number(s.slice(8, 10))}`;

/** 2026-10 → 2026년 10월 */
export const formatMonth = (month: string): string => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`;

// ── 운동 수치 ─────────────────────────────────────────

/** 330 → 5'30" (페이스, km 당) */
export const formatPace = (sec?: number): string => {
  if (!sec || sec <= 0) return '-';
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}'${pad(s % 60)}"`;
};

/** "5:30" · "5'30" · "330" → 330 초. 못 읽으면 undefined */
export const parsePace = (value: string): number | undefined => {
  const v = value.trim().replace(/["”]/g, '');
  if (v === '') return undefined;
  const m = v.match(/^(\d{1,2})\s*[:'’]\s*(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d+$/.test(v) ? Number(v) : undefined;
};

/** 1710 → 28:30, 3723 → 1:02:03 */
export const formatDuration = (sec?: number): string => {
  if (!sec || sec <= 0) return '-';
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/** "28:30" · "1:02:03" → 초, "45" → 45분. 못 읽으면 undefined */
export const parseDuration = (value: string): number | undefined => {
  const v = value.trim();
  if (v === '') return undefined;
  if (/^\d+(\.\d+)?$/.test(v)) return Math.round(Number(v) * 60);
  const parts = v.split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !/^\d+$/.test(p))) return undefined;
  return parts.map(Number).reduce((acc, n) => acc * 60 + n, 0);
};

/** 빈 칸은 undefined, 숫자가 아니면 NaN 대신 undefined */
export const toNumber = (value: string): number | undefined => {
  const v = value.trim().replace(',', '.');
  if (v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

export const formatKm = (km?: number): string => (km === undefined ? '-' : `${Number(km.toFixed(2))}km`);

export const formatNumber = (n: number): string => Math.round(n).toLocaleString('ko-KR');

/** "3분 전" 같은 상대 시각 */
export const formatAgo = (iso?: string): string => {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  return `${Math.floor(diff / 86400)}일 전`;
};
