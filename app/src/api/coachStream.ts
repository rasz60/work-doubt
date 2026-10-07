import { buildURL, getAccessToken } from '@/api/client';
import type { ChatMessage } from '@/types';

interface AskHandlers {
  onDelta: (text: string) => void;
  onDone: (message: ChatMessage) => void;
  onError: (message: string) => void;
}

interface SseEvent {
  event: string;
  data: string;
}

// SSE 프레임("event: x\ndata: y\n\n")을 잘라낸다. 남은 꼬리 문자열을 함께 돌려준다.
const parseFrames = (buffer: string): { events: SseEvent[]; rest: string } => {
  const parts = buffer.split('\n\n');
  const rest = parts.pop() ?? '';

  const events: SseEvent[] = [];
  for (const part of parts) {
    let event = 'message';
    const dataLines: string[] = [];

    for (const line of part.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length > 0) events.push({ event, data: dataLines.join('\n') });
  }
  return { events, rest };
};

/**
 * askCoach 는 SSE 응답을 XMLHttpRequest 로 받는다.
 * fetch 의 ReadableStream 은 React Native 에서 지원되지 않으므로,
 * 웹/iOS/Android 모두에서 동작하는 XHR progress 방식을 쓴다.
 * 반환값은 스트림을 중단하는 함수다.
 */
export const askCoach = (
  conversationId: string,
  question: string,
  handlers: AskHandlers,
): (() => void) => {
  const xhr = new XMLHttpRequest();
  let consumed = 0; // 이미 처리한 responseText 길이
  let buffer = '';

  const drain = (): void => {
    const chunk = xhr.responseText.slice(consumed);
    consumed = xhr.responseText.length;
    if (!chunk) return;

    buffer += chunk;
    const { events, rest } = parseFrames(buffer);
    buffer = rest;

    for (const { event, data } of events) {
      try {
        if (event === 'delta') {
          handlers.onDelta((JSON.parse(data) as { text: string }).text);
        } else if (event === 'done') {
          handlers.onDone(JSON.parse(data) as ChatMessage);
        } else if (event === 'error') {
          handlers.onError((JSON.parse(data) as { message: string }).message);
        }
      } catch {
        handlers.onError('응답을 해석할 수 없습니다.');
      }
    }
  };

  void getAccessToken().then((token) => {
    xhr.open('POST', buildURL(`/api/v1/coach/conversations/${conversationId}/ask`));
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.onprogress = drain;
    xhr.onload = drain;
    xhr.onerror = () => handlers.onError('네트워크 오류가 발생했습니다.');
    xhr.send(JSON.stringify({ question }));
  });

  return () => xhr.abort();
};
