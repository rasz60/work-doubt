import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { Button, Card, Chip, Field, Heading, Message, Screen, T } from '@/components/ui';
import * as api from '@/api/endpoints';
import { askCoach } from '@/api/coachStream';
import { radius, space, useTheme } from '@/theme';
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
      setError(err instanceof Error ? err.message : '대화를 불러오지 못했습니다.');
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
        <ActivityIndicator color={theme.text} />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center', gap: space(3), paddingBottom: space(3) }}>
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
            <Card>
              <T variant="label">이렇게 물어보세요</T>
              <T variant="body">주 3회 운동할 수 있는데, 체지방을 줄이려면 어떤 루틴이 좋을까요?</T>
            </Card>
          )}

          {messages.map((message) => (
            <Bubble key={message.id} role={message.role} content={message.content} />
          ))}
          {streaming !== '' && <Bubble role="assistant" content={streaming} />}
        </ScrollView>

        <Message text={error} tone="error" />

        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space(2) }}>
          <Field value={draft} onChangeText={setDraft} multiline autoCapitalize="sentences" placeholder="코치에게 물어보기" style={{ flex: 1 }} />
          <View style={{ width: 92 }}>
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
}

const Bubble = ({ role, content }: BubbleProps) => {
  const theme = useTheme();
  const mine = role === 'user';

  // 내 질문은 오른쪽 잉크색 말풍선, 코치 답변은 왼쪽 흰 카드
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'stretch',
        maxWidth: mine ? '85%' : '100%',
        backgroundColor: mine ? theme.text : theme.surface,
        borderRadius: radius.card,
        borderBottomRightRadius: mine ? 4 : radius.card,
        borderTopLeftRadius: mine ? radius.card : 4,
        paddingHorizontal: space(4),
        paddingVertical: space(3),
        gap: space(1),
      }}
    >
      {!mine && <T variant="small">코치</T>}
      <T variant="body" color={mine ? theme.bg : theme.text} selectable style={{ lineHeight: 24 }}>
        {content}
      </T>
    </View>
  );
};

export default Coach;
