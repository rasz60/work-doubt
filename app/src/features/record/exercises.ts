import { toNumber } from '@/lib/date';
import type { PlannedExercise, SessionSet } from '@/types';

// 웨이트 입력은 "종목 한 번 + 무게 줄"로 받는다. 스쿼트 20kg 1세트 · 40kg 1세트 · 60kg 3세트 →
//   스쿼트 | 20 × 5 × 1 / 40 × 5 × 1 / 60 × 5 × 3
// 서버에는 기록은 세트마다 한 줄(SessionSet), 계획은 무게 줄마다 한 항목(PlannedExercise)으로 보낸다.

export interface LoadRow {
  weight: string; // 비우면 맨몸
  reps: string;
  sets: string;
}

export interface ExerciseBlock {
  name: string;
  rows: LoadRow[];
}

const str = (n?: number): string => (n === undefined || n === null ? '' : String(n));

export const emptyRow = (): LoadRow => ({ weight: '', reps: '', sets: '1' });

export const emptyBlock = (): ExerciseBlock => ({ name: '', rows: [emptyRow()] });

/** 기록 세트 → 종목 묶음. 이어진 같은 종목을 한 묶음으로, 이어진 같은 무게 · 횟수를 한 줄(세트 수)로 모은다 */
export const blocksFromSets = (sets: SessionSet[]): ExerciseBlock[] => {
  const blocks: ExerciseBlock[] = [];
  for (const set of sets) {
    let block = blocks[blocks.length - 1];
    if (!block || block.name !== set.exercise) {
      block = { name: set.exercise, rows: [] };
      blocks.push(block);
    }
    const last = block.rows[block.rows.length - 1];
    const weight = str(set.weight_kg);
    const reps = str(set.reps);
    if (last && last.weight === weight && last.reps === reps) last.sets = String(Number(last.sets) + 1);
    else block.rows.push({ weight, reps, sets: '1' });
  }
  return blocks;
};

/** 계획 항목 → 종목 묶음. 이어진 같은 이름의 항목을 한 묶음의 여러 무게 줄로 */
export const blocksFromPlanned = (exercises: PlannedExercise[]): ExerciseBlock[] => {
  const blocks: ExerciseBlock[] = [];
  for (const e of exercises) {
    let block = blocks[blocks.length - 1];
    if (!block || block.name !== e.name) {
      block = { name: e.name, rows: [] };
      blocks.push(block);
    }
    block.rows.push({ weight: str(e.weight_kg), reps: str(e.reps), sets: str(e.sets) });
  }
  return blocks;
};

interface ParsedRow {
  name: string;
  weight?: number;
  reps: number;
  sets: number;
}

const parseRows = (blocks: ExerciseBlock[], prefix: string): ParsedRow[] =>
  blocks.flatMap((block) => {
    const name = block.name.trim();
    const rows = block.rows.filter((r) => r.weight.trim() || r.reps.trim());
    if (rows.length === 0) return [];
    if (!name) throw new Error(`${prefix}종목 이름이 빠진 줄이 있습니다.`);
    return rows.map((r) => {
      const reps = Math.round(toNumber(r.reps) ?? 0);
      const sets = r.sets.trim() === '' ? 1 : Math.round(toNumber(r.sets) ?? 0);
      const weight = toNumber(r.weight);
      if (r.weight.trim() && weight === undefined) throw new Error(`${prefix}${name} 무게는 숫자(kg)로 입력하세요.`);
      if (reps <= 0) throw new Error(`${prefix}${name}의 횟수를 입력하세요.`);
      if (sets <= 0 || sets > 20) throw new Error(`${prefix}${name}의 세트 수는 1~20 으로 입력하세요.`);
      return { name, weight: weight && weight > 0 ? weight : undefined, reps, sets };
    });
  });

/** 종목 묶음 → 기록 세트 (세트 수만큼 펼친다). 형식이 틀리면 화면에 보여 줄 문장을 던진다 */
export const setsFromBlocks = (blocks: ExerciseBlock[]): SessionSet[] =>
  parseRows(blocks, '').flatMap((r) =>
    Array.from({ length: r.sets }, () => ({ exercise: r.name, weight_kg: r.weight, reps: r.reps })),
  );

/** 종목 묶음 → 계획 항목 (무게 줄마다 하나) */
export const plannedFromBlocks = (blocks: ExerciseBlock[], prefix = ''): PlannedExercise[] =>
  parseRows(blocks, prefix).map((r) => ({ name: r.name, sets: r.sets, reps: r.reps, weight_kg: r.weight }));

/** 계획 루틴 → 이날 기록용 묶음 (계획 세트 그대로) */
export const blocksForSession = (exercises: PlannedExercise[]): ExerciseBlock[] => blocksFromPlanned(exercises);

// ── 빠른 입력: "20x5 40x5 60x5x3" = 무게 x 횟수 [x 세트]. 맨몸은 "x10" 또는 "0x10" ──

const QUICK_ITEM = /^(\d+(?:[.,]\d+)?)?\s*[x×*]\s*(\d+)(?:\s*[x×*]\s*(\d+))?$/i;

export const parseQuick = (text: string): LoadRow[] | null => {
  const items = text
    .replace(/kg/gi, '')
    .replace(/\s*([x×*])\s*/gi, '$1') // "60 x 5" → "60x5"
    .split(/[,/\s]+/)
    .filter(Boolean);
  if (items.length === 0) return null;
  const rows: LoadRow[] = [];
  for (const item of items) {
    const m = item.match(QUICK_ITEM);
    if (!m) return null;
    const weight = m[1] ? m[1].replace(',', '.') : '';
    rows.push({ weight: weight === '0' ? '' : weight, reps: m[2] ?? '', sets: m[3] ?? '1' });
  }
  return rows;
};

export const formatQuick = (rows: LoadRow[]): string =>
  rows
    .filter((r) => r.reps.trim())
    .map((r) => `${r.weight.trim()}x${r.reps.trim()}${r.sets.trim() && r.sets.trim() !== '1' ? `x${r.sets.trim()}` : ''}`)
    .join(' ');

/** 묶음 요약: 5세트 · 최고 60kg */
export const describeBlock = (block: ExerciseBlock): string => {
  const sets = block.rows.reduce((sum, r) => sum + (r.reps.trim() ? Math.max(1, Math.round(toNumber(r.sets) ?? 1)) : 0), 0);
  const top = Math.max(0, ...block.rows.map((r) => toNumber(r.weight) ?? 0));
  if (sets === 0) return '';
  return `${sets}세트${top > 0 ? ` · 최고 ${top}kg` : ' · 맨몸'}`;
};
