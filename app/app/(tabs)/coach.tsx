import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { Loading, Pet, PetNote } from '@/components/Pixel';
import { Button, Chip, Field, Group, Heading, Message, Screen, T } from '@/components/ui';
import * as api from '@/api/endpoints';
import { HttpError } from '@/api/client';
import { askCoach } from '@/api/coachStream';
import { fonts, layout, space, useTheme } from '@/theme';
import { GOAL_LABELS, type ChatMessage, type Conversation, type Goal } from '@/types';

const GOALS = Object.keys(GOAL_LABELS) as Goal[];

// 대화형 운동 추천. 답변은 SSE 로 토큰 단위로 흘러 들어온다.
const Coach = () => {
  const theme = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [goal, setGoal] = useState<Goal>('fat_loss');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState<string>('');
  const [streaming, setStreaming] = useState<string>('');
  const [busy, setBusy] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  // 공용 테스터 계정은 AI 코치를 쓸 수 없다 (서버가 403 tester_blocked)
  const [blocked, setBlocked] = useState<boolean>(false);

  // 가장 최근 대화를 이어서 열고, 없으면 비워 둔다.
  const bootstrap = useCallback(async (): Promise<void> => {
    try {
      const { items } = await api.fetchConversations();
      const latest = items[0];
      if (!latest) return;

      setConversation(latest);
      setGoal(latest.goal ?? 'fat_loss');
      setMessages((await api.fetchMessages(latest.id)).items);
    } catch (err) {
      if (err instanceof HttpError && err.code === 'tester_blocked') setBlocked(true);
      else setError(err instanceof Error ? err.message : '대화를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  const ensureConversation = async (): Promise<Conversation> => {
    if (conversation) return conversation;

    const created = await api.startConversation(goal, GOAL_LABELS[goal]);
    setConversation(created);
    return created;
  };

  const send = async (): Promise<void> => {
    const question = draft.trim();
    if (!question || busy) return;

    setBusy(true);
    setError('');
    setDraft('');
    setStreaming('');

    try {
      const target = await ensureConversation();
      setMessages((prev) => [
        ...prev,
        {
          id: `local-${Date.now()}`,
          conversation_id: target.id,
          role: 'user',
          content: question,
          created_at: new Date().toISOString(),
        },
      ]);

      askCoach(target.id, question, {
        onDelta: (text) => setStreaming((prev) => prev + text),
        onDone: (message) => {
          setMessages((prev) => [...prev, message]);
          setStreaming('');
          setBusy(false);
        },
        onError: (message) => {
          setError(message);
          setStreaming('');
          setBusy(false);
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '질문을 보내지 못했습니다.');
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }

  if (blocked) {
    return (
      <Screen>
        <View style={{ width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', gap: space(3) }}>
          <Heading title="AI 코치" caption="테스터 계정에서는 쓸 수 없는 기능이에요." />
          <Group style={{ gap: space(2) }}>
            <T variant="body">AI 코치는 초대받은 계정으로 로그인하면 쓸 수 있어요.</T>
            <T variant="small">운동 기록 · 계획 · 신체 지표는 테스터 계정에서도 그대로 써 볼 수 있어요.</T>
          </Group>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, width: '100%', maxWidth: layout.maxWidth, alignSelf: 'center', gap: space(3), paddingBottom: space(3) }}>
        <Heading title={conversation ? conversation.title : 'AI 코치'} caption={conversation ? undefined : '내 기록과 신체 지표를 보고 답해요.'} />

        {!conversation && (
          <View style={{ gap: space(2) }}>
            <T variant="label">목표</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
              {GOALS.map((item) => (
                <Chip key={item} label={GOAL_LABELS[item]} selected={goal === item} onPress={() => setGoal(item)} />
              ))}
            </View>
          </View>
        )}

        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: space(3), paddingVertical: space(2) }}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        >
          {messages.length === 0 && !streaming && (
            <View style={{ gap: space(3) }}>
              <PetNote mood="happy">궁금한 걸 물어보세요. 내 기록과 신체 지표를 보고 답해요.</PetNote>
              <Group style={{ gap: space(2) }}>
                <T variant="label">이렇게 물어보세요</T>
                <T variant="body">주 3회 운동할 수 있는데, 체지방을 줄이려면 어떤 루틴이 좋을까요?</T>
              </Group>
            </View>
          )}

          {messages.map((message) => (
            <Bubble key={message.id} role={message.role} content={message.content} />
          ))}
          {streaming !== '' && <Bubble role="assistant" content={streaming} streaming />}
        </ScrollView>

        <Message text={error} tone="error" />

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
          <Field value={draft} onChangeText={setDraft} multiline autoCapitalize="sentences" placeholder="코치에게 물어보기" style={{ flex: 1 }} />
          <View style={{ width: 112 }}>
            <Button title={busy ? '…' : '보내기'} onPress={() => void send()} disabled={busy || !draft.trim()} />
          </View>
        </View>
      </View>
    </Screen>
  );
};

interface BubbleProps {
  role: ChatMessage['role'];
  content: string;
  /** 지금 답변이 흘러 들어오는 중 */
  streaming?: boolean;
}

const Bubble = ({ role, content, streaming }: BubbleProps) => {
  const theme = useTheme();
  const mine = role === 'user';

  // 코치 답변은 왼쪽 펫 + LCD 말풍선(꼬리 있음), 내 질문은 오른쪽 크림색 말풍선. 길게 읽는 본문은 시스템 고딕
  const bubble = (
    <View
      style={{
        flexShrink: 1,
        backgroundColor: mine ? theme.cream : theme.sheet,
        borderWidth: 3,
        borderColor: theme.outline,
        paddingHorizontal: space(4),
        paddingVertical: space(3),
        gap: space(1),
      }}
    >
      {!mine && <T variant="small">코치</T>}
      <T variant="body" color={mine ? theme.onCream : theme.ink} selectable style={{ lineHeight: 25, fontFamily: fonts.sans }}>
        {content}
      </T>
    </View>
  );

  if (mine) return <View style={{ alignSelf: 'flex-end', maxWidth: '85%', paddingRight: 4 }}>{bubble}</View>;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space(2), paddingRight: 4 }}>
      <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'flex-end', backgroundColor: theme.sheet, borderWidth: 3, borderColor: theme.outline }}>
        <Pet mood={streaming ? 'cheer' : 'normal'} cell={3} hop={!!streaming} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        {/* 말풍선 꼬리: 펫 쪽으로 향한 네모 */}
        <View style={{ position: 'absolute', left: -9, top: 14, width: 12, height: 12, backgroundColor: theme.sheet, borderLeftWidth: 3, borderBottomWidth: 3, borderColor: theme.outline, transform: [{ rotate: '45deg' }], zIndex: 1 }} />
        {bubble}
      </View>
    </View>
  );
};

export default Coach;
