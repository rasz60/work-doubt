import React, { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, DateStepper, Field, Message } from '@/components/ui';
import * as api from '@/api/endpoints';
import { toNumber, todayString } from '@/lib/date';
import { space } from '@/theme';

// 신체 지표(키 · 체중 · 골격근량 · 체지방률). 체중은 소비 칼로리 추정과 AI 코치가 쓴다.
export const BodyForm = () => {
  const today = todayString();
  const [measuredAt, setMeasuredAt] = useState<string>(today);
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
      setResult(saved.bmi ? `저장했어요. BMI ${saved.bmi.toFixed(1)}` : '저장했어요.');
      setMemo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card style={{ gap: space(5) }}>
      <DateStepper value={measuredAt} onChange={setMeasuredAt} max={today} />
      <View style={{ flexDirection: 'row', gap: space(3) }}>
        <Field label="체중" unit="kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" style={{ flex: 1 }} />
        <Field label="키" unit="cm" value={height} onChangeText={setHeight} keyboardType="decimal-pad" style={{ flex: 1 }} />
      </View>
      <View style={{ flexDirection: 'row', gap: space(3) }}>
        <Field label="골격근량" unit="kg" value={muscle} onChangeText={setMuscle} keyboardType="decimal-pad" style={{ flex: 1 }} />
        <Field label="체지방률" unit="%" value={fat} onChangeText={setFat} keyboardType="decimal-pad" style={{ flex: 1 }} />
      </View>
      <Field label="메모" value={memo} onChangeText={setMemo} multiline autoCapitalize="sentences" />
      <Message text="같은 날짜에 다시 저장하면 덮어써요. 체중은 칼로리 추정에, 키와 체중은 BMI 계산에 쓰여요." />

      <Message text={error} tone="error" />
      <Message text={result} tone="ok" />
      <Button title={busy ? '저장하는 중…' : '저장'} onPress={() => void submit()} disabled={busy} />
    </Card>
  );
};
