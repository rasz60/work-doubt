import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { Button, Field, Message, Screen } from '@/components/ui';
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
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen>
      {!conversation && (
        <View style={{ gap: space(2) }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: '600' }}>목표를 고르세요</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space(2) }}>
            {GOALS.map((item) => (
              <Pressable
                key={item}
                onPress={() => setGoal(item)}
                style={{
                  paddingHorizontal: space(3),
                  paddingVertical: space(2),
                  borderRadius: radius,
                  borderWidth: 1,
                  borderColor: goal === item ? theme.accent : theme.border,
                  backgroundColor: theme.surface,
                }}
              >
                <Text style={{ color: goal === item ? theme.accent : theme.textMuted, fontSize: 13 }}>
                  {GOAL_LABELS[item]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={{ gap: space(2), paddingVertical: space(2) }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && !streaming && (
          <Message text="예) 주 3회 운동할 수 있는데, 체지방을 줄이려면 어떤 루틴이 좋을까요?" />
        )}

        {messages.map((message) => (
          <Bubble key={message.id} role={message.role} content={message.content} />
        ))}
        {streaming !== '' && <Bubble role="assistant" content={streaming} />}
      </ScrollView>

      <Message text={error} tone="error" />

      <Field label="질문" value={draft} onChangeText={setDraft} multiline autoCapitalize="sentences" />
      <Button title={busy ? '답변 생성 중…' : '보내기'} onPress={() => void send()} disabled={busy} />
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

  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '88%',
        backgroundColor: mine ? theme.accent : theme.surface,
        borderColor: mine ? theme.accent : theme.border,
        borderWidth: 1,
        borderRadius: radius,
        paddingHorizontal: space(3),
        paddingVertical: space(2),
      }}
    >
      <Text style={{ color: mine ? '#ffffff' : theme.text, fontSize: 14, lineHeight: 20 }}>
        {content}
      </Text>
    </View>
  );
};

export default Coach;
