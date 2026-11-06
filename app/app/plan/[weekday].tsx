import React from 'react';
import { View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Button, Header, KindChips, Message, NumberInput, Page, Screen, StickyFooter, T } from '@/components/ui';
import { ExerciseBlocks } from '@/features/record/ExerciseBlocks';
import { exerciseNames } from '@/features/record/exercises';
import { usePlanDraft } from '@/features/record/PlanDraftContext';
import { weekdayLabel } from '@/lib/date';
import { space } from '@/theme';
import { KIND_LABELS, type PlanKind } from '@/types';

const PLAN_KINDS: { value: PlanKind; label: string }[] = (['run', 'weight', 'rest'] as const).map((value) => ({ value, label: KIND_LABELS[value] }));

// 요일 하나 고치기. 고친 내용은 계획 화면의 "계획 저장"으로 한 번에 저장한다.
const PlanDay = () => {
  const { weekday: raw } = useLocalSearchParams<{ weekday?: string }>();
  const weekday = Number(raw);
  const { plans, draft, updateDay } = usePlanDraft();
  const day = draft.days.find((d) => d.weekday === weekday);

  if (!day) {
    return (
      <Screen>
        <Page>
          <Header back="계획" fallback="/plan" />
          <Message text="없는 요일이에요." tone="error" />
        </Page>
      </Screen>
    );
  }

  // 고를 종목: 다른 요일에 쓴 것 → 저장된 계획 순 (이 요일에 이미 있는 이름은 ExerciseBlocks 가 뺀다)
  const others = draft.days.flatMap((d) => d.blocks.map((b) => b.name.trim())).filter(Boolean);
  const suggestions = [...new Set([...others, ...exerciseNames(plans, [])])];

  return (
    <Screen>
      <Page footerSpace>
        <Header back="계획" fallback="/plan" title={`${weekdayLabel(weekday)}요일`} />
        <KindChips options={PLAN_KINDS} value={day.kind} onChange={(kind) => updateDay(weekday, { kind })} />

        {day.kind === 'rest' ? <T variant="body">쉬는 날이에요. 이날 운동하면 '추가 운동'으로 잔디에 남아요.</T> : null}

        {day.kind === 'run' ? (
          <View style={{ gap: space(6) }}>
            <View style={{ flexDirection: 'row', gap: space(5) }}>
              <NumberInput label="목표 거리" unit="km" value={day.distance} onChangeText={(v) => updateDay(weekday, { distance: v })} placeholder="0.0" style={{ flex: 1 }} />
              <NumberInput label="목표 페이스" unit="/km" value={day.pace} onChangeText={(v) => updateDay(weekday, { pace: v })} placeholder="5:30" decimal={false} style={{ flex: 1 }} />
            </View>
            <NumberInput label="목표 칼로리 (선택)" unit="kcal" value={day.targetKcal} onChangeText={(v) => updateDay(weekday, { targetKcal: v })} placeholder="자동" size="medium" style={{ width: 200 }} />
          </View>
        ) : null}

        {day.kind === 'weight' ? (
          <View style={{ gap: space(6) }}>
            <ExerciseBlocks blocks={day.blocks} onChange={(blocks) => updateDay(weekday, { blocks })} suggestions={suggestions} />
            <NumberInput label="목표 칼로리 (선택)" unit="kcal" value={day.targetKcal} onChangeText={(v) => updateDay(weekday, { targetKcal: v })} placeholder="자동" size="medium" style={{ width: 200 }} />
          </View>
        ) : null}
      </Page>
      <StickyFooter>
        <Button title="완료" onPress={() => (router.canGoBack() ? router.back() : router.replace('/plan'))} />
      </StickyFooter>
    </Screen>
  );
};

export default PlanDay;
