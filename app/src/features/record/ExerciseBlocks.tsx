import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { MiniInput, TextButton } from '@/components/ui';
import { space, useTheme } from '@/theme';

import { describeBlock, emptyBlock, emptyRow, formatQuick, parseQuick, type ExerciseBlock, type LoadRow } from './exercises';

interface ExerciseBlocksProps {
  blocks: ExerciseBlock[];
  onChange: (blocks: ExerciseBlock[]) => void;
}

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
    <View style={{ gap: space(4) }}>
      {blocks.map((block, index) => (
        <View key={index} style={{ gap: space(2), borderLeftWidth: 2, borderLeftColor: theme.text, paddingLeft: space(3) }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
            <MiniInput label="종목" value={block.name} onChangeText={(v) => update(index, { name: v })} placeholder="스쿼트" flex={1} />
            <Text style={{ color: theme.textMuted, fontSize: 11, paddingBottom: space(2) }}>{describeBlock(block)}</Text>
            <Pressable onPress={() => onChange(blocks.filter((_, i) => i !== index))} hitSlop={8} accessibilityLabel="종목 지우기">
              <Text style={{ color: theme.textMuted, fontSize: 16, paddingBottom: space(1.5) }}>×</Text>
            </Pressable>
          </View>

          {block.rows.map((row, rowIndex) => (
            <View key={rowIndex} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
              <MiniInput label={rowIndex === 0 ? '무게 kg' : undefined} value={row.weight} onChangeText={(v) => updateRow(index, rowIndex, { weight: v })} keyboardType="decimal-pad" placeholder="맨몸" flex={1} />
              <Text style={{ color: theme.textMuted, paddingBottom: space(2) }}>×</Text>
              <MiniInput label={rowIndex === 0 ? '횟수' : undefined} value={row.reps} onChangeText={(v) => updateRow(index, rowIndex, { reps: v })} keyboardType="number-pad" placeholder="5" flex={1} />
              <Text style={{ color: theme.textMuted, paddingBottom: space(2) }}>×</Text>
              <MiniInput label={rowIndex === 0 ? '세트' : undefined} value={row.sets} onChangeText={(v) => updateRow(index, rowIndex, { sets: v })} keyboardType="number-pad" placeholder="1" flex={1} />
              <Pressable
                onPress={() => update(index, { rows: block.rows.length > 1 ? block.rows.filter((_, i) => i !== rowIndex) : [emptyRow()] })}
                hitSlop={8}
                accessibilityLabel="무게 줄 지우기"
              >
                <Text style={{ color: theme.textMuted, fontSize: 16, paddingBottom: space(1.5) }}>×</Text>
              </Pressable>
            </View>
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(3) }}>
            <TextButton
              title="+ 무게 추가"
              onPress={() => {
                const last = block.rows[block.rows.length - 1];
                update(index, { rows: [...block.rows, last ? { ...last, sets: '1' } : emptyRow()] });
              }}
            />
            <QuickInput rows={block.rows} onRows={(rows) => update(index, { rows })} />
          </View>
        </View>
      ))}
      <TextButton title="+ 종목 추가" onPress={() => onChange([...blocks, emptyBlock()])} />
    </View>
  );
};

interface QuickInputProps {
  rows: LoadRow[];
  onRows: (rows: LoadRow[]) => void;
}

// 빠른 입력 "20x5 40x5 60x5x3" (무게x횟수x세트). 입력하는 동안 읽을 수 있으면 바로 위 줄들에 반영한다.
const QuickInput = ({ rows, onRows }: QuickInputProps) => {
  const theme = useTheme();
  const [text, setText] = useState<string>('');
  const [focused, setFocused] = useState<boolean>(false);
  const shown = focused ? text : formatQuick(rows);
  const invalid = focused && text.trim() !== '' && parseQuick(text) === null;

  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <TextInput
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
        placeholder="빠른 입력 20x5 40x5 60x5x3"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        style={{
          borderBottomWidth: 1,
          borderBottomColor: invalid ? theme.danger : focused ? theme.text : theme.border,
          color: theme.textMuted,
          fontSize: 12,
          paddingVertical: space(1),
          minWidth: 0,
        }}
      />
    </View>
  );
};
