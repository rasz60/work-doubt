import React, { useState } from 'react';
import { ScrollView } from 'react-native';

import { Button, Field, Heading, Message, Screen } from '@/components/ui';
import * as api from '@/api/endpoints';
import { space } from '@/theme';

const today = (): string => new Date().toISOString().slice(0, 10);

// 숫자 입력은 빈 문자열을 undefined 로 바꿔 서버에 보내지 않는다(부분 입력 허용).
const toNumber = (value: string): number | undefined => {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const Record = () => {
  const [measuredAt, setMeasuredAt] = useState<string>(today());
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
      setResult(
        saved.bmi ? `저장했습니다. BMI ${saved.bmi.toFixed(1)}` : '저장했습니다.',
      );
      setMemo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ gap: space(5), paddingBottom: space(6) }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Heading
          eyebrow="Record"
          title="지표 입력"
          caption="같은 날짜를 다시 저장하면 기존 기록을 덮어씁니다. BMI 는 키와 체중으로 자동 계산됩니다."
        />

        <Field label="측정일 (YYYY-MM-DD)" value={measuredAt} onChangeText={setMeasuredAt} />
        <Field label="키 (cm)" value={height} onChangeText={setHeight} keyboardType="decimal-pad" />
        <Field label="체중 (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
        <Field
          label="골격근량 (kg)"
          value={muscle}
          onChangeText={setMuscle}
          keyboardType="decimal-pad"
        />
        <Field label="체지방률 (%)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
        <Field label="메모" value={memo} onChangeText={setMemo} multiline autoCapitalize="sentences" />

        <Message text={error} tone="error" />
        <Message text={result} />

        <Button title="SAVE" onPress={() => void submit()} disabled={busy} />
      </ScrollView>
    </Screen>
  );
};

export default Record;
