import React, { useState } from 'react';
import { View } from 'react-native';

import { Button, Field, Message } from '@/components/ui';
import * as api from '@/api/endpoints';
import { toNumber, todayString } from '@/lib/date';
import { space } from '@/theme';

// 신체 지표(키 · 체중 · 골격근량 · 체지방률). 체중은 소비 칼로리 추정과 AI 코치가 쓴다.
export const BodyForm = () => {
  const [measuredAt, setMeasuredAt] = useState<string>(todayString());
  const [height, setHeight] = useState<string>('');
  const [weight, setWeight] = useState<string>('');
  const [muscle, setMuscle] = useState<string>('');
  const [fat, setFat] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);

  const submit = async (): Promise<void> => {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const saved = await api.recordMetric({
        measured_at: measuredAt,
        height_cm: toNumber(height),
        weight_kg: toNumber(weight),
        skeletal_muscle_kg: toNumber(muscle),
        body_fat_percentage: toNumber(fat),
        memo: memo || undefined,
      });
      setResult(saved.bmi ? `저장했습니다. BMI ${saved.bmi.toFixed(1)}` : '저장했습니다.');
      setMemo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: space(5) }}>
      <Message text="같은 날짜를 다시 저장하면 기존 기록을 덮어씁니다. 체중은 소비 칼로리 추정에 쓰이고, BMI 는 키와 체중으로 자동 계산됩니다." />
      <Field label="측정일 (YYYY-MM-DD)" value={measuredAt} onChangeText={setMeasuredAt} />
      <Field label="키 (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" />
      <Field label="체중 (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
      <Field label="골격근량 (kg)" value={muscle} onChangeText={setMuscle} keyboardType="decimal-pad" />
      <Field label="체지방률 (%)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
      <Field label="메모" value={memo} onChangeText={setMemo} multiline autoCapitalize="sentences" />

      <Message text={error} tone="error" />
      <Message text={result} />

      <Button title="SAVE" onPress={() => void submit()} disabled={busy} />
    </View>
  );
};
