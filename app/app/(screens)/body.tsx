import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, DatePicker, Field, Header, Message, NumberInput, Page, Screen, StickyFooter, T, TextButton } from '@/components/ui';
import * as api from '@/api/endpoints';
import { formatShortDate, toNumber, todayString } from '@/lib/date';
import { space } from '@/theme';
import type { BodyMetric } from '@/types';

const str = (n?: number): string => (n === undefined || n === null ? '' : String(n));

// 신체 기록: 체중 하나를 크게 받는다. 키 · 골격근량 · 체지방률 · 메모는 "더 입력"으로 접는다.
// 지난 값은 회색 placeholder 로 보여 준다. 같은 날짜에 다시 저장하면 덮어쓴다.
const Body = () => {
  const today = todayString();
  const [latest, setLatest] = useState<BodyMetric | null>(null);
  const [measuredAt, setMeasuredAt] = useState<string>(today);
  const [weight, setWeight] = useState<string>('');
  const [height, setHeight] = useState<string>('');
  const [muscle, setMuscle] = useState<string>('');
  const [fat, setFat] = useState<string>('');
  const [memo, setMemo] = useState<string>('');
  const [more, setMore] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<string>('');

  useEffect(() => {
    api
      .fetchLatestMetric()
      .then(setLatest)
      .catch(() => undefined); // 기록이 없으면 404 — placeholder 없이 시작
  }, []);

  const submit = async (): Promise<void> => {
    setError('');
    setResult('');
    const values = { weight_kg: toNumber(weight), height_cm: toNumber(height), skeletal_muscle_kg: toNumber(muscle), body_fat_percentage: toNumber(fat) };
    for (const [raw, label] of [
      [weight, '체중'],
      [height, '키'],
      [muscle, '골격근량'],
      [fat, '체지방률'],
    ] as const) {
      if (raw.trim() && toNumber(raw) === undefined) {
        setError(`${label}은(는) 숫자로 입력하세요.`);
        return;
      }
    }
    if (Object.values(values).every((v) => v === undefined)) {
      setError('체중이나 다른 값을 하나 이상 입력하세요.');
      return;
    }
    setBusy(true);
    try {
      const saved = await api.recordMetric({ measured_at: measuredAt, ...values, memo: memo.trim() || undefined });
      setLatest(saved);
      setResult(saved.bmi ? `저장했어요. BMI ${saved.bmi.toFixed(1)}` : '저장했어요.');
      setWeight('');
      setHeight('');
      setMuscle('');
      setFat('');
      setMemo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const showMore = more || !!(height || muscle || fat || memo);

  return (
    <Screen>
      <Page footerSpace>
        <Header back="뒤로" fallback="/me" title="신체 기록" />
        <DatePicker value={measuredAt} onChange={setMeasuredAt} max={today} />

        <NumberInput label="체중" unit="kg" value={weight} onChangeText={setWeight} placeholder={str(latest?.weight_kg) || '0.0'} />
        {latest ? (
          <T variant="caption">
            지난 기록 {formatShortDate(latest.measured_at)}
            {latest.weight_kg ? ` · ${latest.weight_kg}kg` : ''}
            {latest.bmi ? ` · BMI ${latest.bmi.toFixed(1)}` : ''}
          </T>
        ) : null}

        {showMore ? (
          <View style={{ gap: space(5) }}>
            <View style={{ flexDirection: 'row', gap: space(5) }}>
              <NumberInput label="키" unit="cm" value={height} onChangeText={setHeight} placeholder={str(latest?.height_cm) || '-'} size="medium" style={{ flex: 1 }} />
              <NumberInput label="골격근량" unit="kg" value={muscle} onChangeText={setMuscle} placeholder={str(latest?.skeletal_muscle_kg) || '-'} size="medium" style={{ flex: 1 }} />
            </View>
            <NumberInput label="체지방률" unit="%" value={fat} onChangeText={setFat} placeholder={str(latest?.body_fat_percentage) || '-'} size="medium" style={{ width: '47%' }} />
            <Field label="메모" value={memo} onChangeText={setMemo} multiline autoCapitalize="sentences" />
          </View>
        ) : (
          <TextButton title="+ 키 · 골격근량 · 체지방률 · 메모" tone="muted" onPress={() => setMore(true)} />
        )}

        <T variant="caption">체중은 칼로리 추정에, 키와 체중은 BMI 계산에 쓰여요. 같은 날짜에 다시 저장하면 덮어써요.</T>
        <Message text={error} tone="error" />
        <Message text={result} tone="ok" />
      </Page>
      <StickyFooter>
        <Button title={busy ? '저장하는 중…' : '저장'} onPress={() => void submit()} disabled={busy} />
      </StickyFooter>
    </Screen>
  );
};

export default Body;
