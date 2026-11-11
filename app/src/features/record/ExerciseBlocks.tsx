import React, { useState } from 'react';
import { Pressable, View } from 'react-native';

import { KindMark } from '@/components/KindMark';
import { Chip, Field, Stepper, T, TextButton } from '@/components/ui';
import { radius, space, useTheme } from '@/theme';

import { describeBlock, describeRow, emptyRow, type ExerciseBlock, type LoadRow } from './exercises';

interface ExerciseBlocksProps {
  blocks: ExerciseBlock[];
  onChange: (blocks: ExerciseBlock[]) => void;
  /** 고를 수 있는 종목 이름 (계획 · 최근 기록) */
  suggestions: string[];
}

type Editing = { block: number; row: number } | null;

// 웨이트 입력: 종목마다 "60kg × 5회 × 3세트" 줄을 글자로 보여 주고, 누른 줄만 스테퍼로 연다.
// 종목은 칩으로 고르고, 없을 때만 이름을 친다. 저장 형식(무게 × 횟수 × 세트 줄)은 예전과 같다.
export const ExerciseBlocks = ({ blocks, onChange, suggestions }: ExerciseBlocksProps) => {
  const theme = useTheme();
  const [editing, setEditing] = useState<Editing>(null);
  // 이름을 치는 중인 종목 (첫 글자를 친 뒤에도 입력 칸을 유지한다)
  const [naming, setNaming] = useState<number | null>(null);

  const update = (index: number, patch: Partial<ExerciseBlock>): void =>
    onChange(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  const updateRow = (index: number, rowIndex: number, patch: Partial<LoadRow>): void => {
    const block = blocks[index];
    if (block) update(index, { rows: block.rows.map((r, i) => (i === rowIndex ? { ...r, ...patch } : r)) });
  };

  const addBlock = (name: string): void => {
    onChange([...blocks, { name, rows: [emptyRow()] }]);
    // 이름을 골랐으면 첫 줄을 바로 열고, 직접 입력이면 이름 칸을 연다
    setEditing(name ? { block: blocks.length, row: 0 } : null);
    setNaming(name ? null : blocks.length);
  };

  const removeBlock = (index: number): void => {
    onChange(blocks.filter((_, i) => i !== index));
    setEditing(null);
    setNaming(null);
  };

  const removeRow = (index: number, rowIndex: number): void => {
    const block = blocks[index];
    if (!block) return;
    update(index, { rows: block.rows.length > 1 ? block.rows.filter((_, i) => i !== rowIndex) : [emptyRow()] });
    setEditing(null);
  };

  const addRow = (index: number): void => {
    const block = blocks[index];
    if (!block) return;
    const last = block.rows[block.rows.length - 1];
    update(index, { rows: [...block.rows, last ? { ...last, sets: '1' } : emptyRow()] });
    setEditing({ block: index, row: block.rows.length });
  };

  const names = blocks.map((b) => b.name.trim());
  const choices = suggestions.filter((n) => !names.includes(n));

  return (
    <View style={{ gap: space(5) }}>
      {blocks.map((block, index) => {
        const summary = describeBlock(block);
        return (
          <View key={index} style={{ gap: space(2) }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space(2) }}>
              <KindMark kind="weight" size={9} />
              {naming === index || block.name.trim() === '' ? (
                <Field
                  value={block.name}
                  onChangeText={(v) => update(index, { name: v })}
                  placeholder="종목 이름 (예: 스쿼트)"
                  autoFocus={naming === index}
                  onSubmitEditing={() => setNaming(null)}
                  style={{ flex: 1 }}
                />
              ) : (
                <Pressable
                  onPress={() => setNaming(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`${block.name} 이름 고치기`}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <T variant="heading" numberOfLines={1}>
                    {block.name}
                  </T>
                </Pressable>
              )}
              {summary ? <T variant="small">{summary}</T> : null}
              <TextButton title="빼기" tone="muted" onPress={() => removeBlock(index)} />
            </View>

            <View style={{ gap: space(1.5), paddingLeft: space(5) }}>
              {block.rows.map((row, rowIndex) => {
                const open = editing?.block === index && editing.row === rowIndex;
                if (!open) {
                  return (
                    <Pressable
                      key={rowIndex}
                      onPress={() => setEditing({ block: index, row: rowIndex })}
                      accessibilityRole="button"
                      accessibilityLabel={`${block.name || '종목'} ${describeRow(row)} 고치기`}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        minHeight: 44,
                        paddingHorizontal: space(3),
                        borderRadius: radius.box,
                        backgroundColor: theme.field,
                        borderWidth: 3,
                        borderColor: theme.outline,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <T variant="numMd" style={{ flex: 1 }} color={row.reps.trim() ? theme.ink : theme.muted}>
                        {describeRow(row)}
                      </T>
                      <T variant="small">고치기</T>
                    </Pressable>
                  );
                }
                return (
                  <View
                    key={rowIndex}
                    style={{ gap: space(3), padding: space(3), borderRadius: radius.box, backgroundColor: theme.field, borderWidth: 3, borderColor: theme.outline }}
                  >
                    <View style={{ flexDirection: 'row', gap: space(2) }}>
                      <Stepper label="무게" unit="kg" value={row.weight} step={2.5} placeholder="맨몸" onChange={(v) => updateRow(index, rowIndex, { weight: v })} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: space(3) }}>
                      <Stepper label="횟수" unit="회" value={row.reps} min={1} placeholder="5" onChange={(v) => updateRow(index, rowIndex, { reps: v })} />
                      <Stepper label="세트" value={row.sets} min={1} placeholder="1" onChange={(v) => updateRow(index, rowIndex, { sets: v })} />
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <TextButton title="이 줄 지우기" tone="muted" onPress={() => removeRow(index, rowIndex)} />
                      <TextButton title="완료" onPress={() => setEditing(null)} />
                    </View>
                  </View>
                );
              })}
              <TextButton title="+ 다른 무게 줄" tone="muted" onPress={() => addRow(index)} />
            </View>
          </View>
        );
      })}

      <View style={{ gap: space(2) }}>
        <T variant="label">{blocks.length ? '종목 더하기' : '종목 고르기'}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
          {choices.map((name) => (
            <Chip key={name} label={name} onPress={() => addBlock(name)} />
          ))}
          <Chip label="+ 직접 입력" onPress={() => addBlock('')} />
        </View>
      </View>
    </View>
  );
};
