import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Field, Stepper, T, TextButton } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

import { describeBlock, emptyBlock, emptyRow, formatQuick, parseQuick, type ExerciseBlock, type LoadRow } from './exercises';

interface ExerciseBlocksProps {
  blocks: ExerciseBlock[];
  onChange: (blocks: ExerciseBlock[]) => void;
}

// 표의 열 너비: 무게 상자 · 횟수 · 세트 스테퍼 · 지우기
const COLS = { weight: 1, reps: 1.15, sets: 1.15, remove: 28 } as const;

// 웨이트 입력: 종목 이름은 한 번, 그 아래에 무게 × 횟수 × 세트 줄. 같은 무게를 여러 세트 하면 세트 수만 올린다.
export const ExerciseBlocks = ({ blocks, onChange }: ExerciseBlocksProps) => {
  const theme = useTheme();

  const update = (index: number, patch: Partial<ExerciseBlock>): void =>
    onChange(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const updateRow = (index: number, rowIndex: number, patch: Partial<LoadRow>): void => {
    const block = blocks[index];
    if (block) update(index, { rows: block.rows.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)) });
  };

  return (
    <View style={{ gap: space(3) }}>
      {blocks.map((block, index) => (
        <View
          key={index}
          style={{ gap: space(3), borderWidth: 1, borderColor: theme.line, borderRadius: radius.tile, padding: space(3) }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
            <Field label={`종목 ${index + 1}`} value={block.name} onChangeText={(v) => update(index, { name: v })} placeholder="스쿼트" style={{ flex: 1 }} />
            <RemoveButton label="종목 지우기" onPress={() => onChange(blocks.filter((_, i) => i !== index))} height={50} />
          </View>

          {/* 표 머리: 한 번만 */}
          <View style={{ flexDirection: 'row', gap: space(1.5) }}>
            <T variant="small" style={{ flex: COLS.weight }}>
              무게
            </T>
            <T variant="small" style={{ flex: COLS.reps, textAlign: 'center' }}>
              횟수
            </T>
            <T variant="small" style={{ flex: COLS.sets, textAlign: 'center' }}>
              세트
            </T>
            <View style={{ width: COLS.remove }} />
          </View>

          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: 'row', alignItems: 'center', gap: space(1.5) }}>
              <Field
                compact
                unit="kg"
                value={row.weight}
                onChangeText={(v) => updateRow(index, rowIndex, { weight: v })}
                keyboardType="decimal-pad"
                placeholder="맨몸"
                style={{ flex: COLS.weight }}
              />
              <View style={{ flex: COLS.reps, minWidth: 0 }}>
                <Stepper value={row.reps} onChange={(v) => updateRow(index, rowIndex, { reps: v })} min={1} placeholder="5" />
              </View>
              <View style={{ flex: COLS.sets, minWidth: 0 }}>
                <Stepper value={row.sets} onChange={(v) => updateRow(index, rowIndex, { sets: v })} min={1} placeholder="1" />
              </View>
              <RemoveButton
                label="무게 줄 지우기"
                onPress={() => update(index, { rows: block.rows.length > 1 ? block.rows.filter((_, i) => i !== rowIndex) : [emptyRow()] })}
                height={42}
              />
            </View>
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space(3) }}>
            <TextButton
              title="+ 무게 줄"
              onPress={() => {
                const last = block.rows[block.rows.length - 1];
                update(index, { rows: [...block.rows, last ? { ...last, sets: '1' } : emptyRow()] });
              }}
            />
            <T variant="small" style={{ fontWeight: '500' }}>
              {describeBlock(block)}
            </T>
          </View>
          <QuickInput rows={block.rows} onRows={(rows) => update(index, { rows })} />
        </View>
      ))}
      <Button title="+ 종목 추가" variant="secondary" onPress={() => onChange([...blocks, emptyBlock()])} />
    </View>
  );
};

const RemoveButton = ({ label, onPress, height }: { label: string; onPress: () => void; height: number }) => {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({ width: COLS.remove, height, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.5 : 1 })}
    >
      <T variant="heading" color={theme.textMuted} style={{ fontWeight: '400' }}>
        ×
      </T>
    </Pressable>
  );
};

interface QuickInputProps {
  rows: LoadRow[];
  onRows: (rows: LoadRow[]) => void;
}

// 빠른 입력 "20x5 40x5 60x5x3" (무게x횟수x세트). 입력하는 동안 읽을 수 있으면 바로 위 줄들에 반영한다.
const QuickInput = ({ rows, onRows }: QuickInputProps) => {
  const [text, setText] = useState<string>('');
  const [focused, setFocused] = useState<boolean>(false);
  const shown = focused ? text : formatQuick(rows);
  const invalid = focused && text.trim() !== '' && parseQuick(text) === null;

  return (
    <Field
      compact
      value={shown}
      onChangeText={(value) => {
        setText(value);
        const parsed = parseQuick(value);
        if (parsed) onRows(parsed);
      }}
      onFocus={() => {
        setText(formatQuick(rows));
        setFocused(true);
      }}
      onBlur={() => setFocused(false)}
      invalid={invalid}
      digits
      placeholder="빠른 입력 · 20x5 40x5 60x5x3"
      hint={invalid ? '무게x횟수 또는 무게x횟수x세트를 띄어 쓰세요' : undefined}
    />
  );
};
