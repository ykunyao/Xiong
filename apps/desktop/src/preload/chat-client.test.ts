import { describe, expect, test, vi } from 'vitest';
import type { ChatStreamEvent } from '../shared/chat';
import { createChatClient, type ChatIpcRenderer } from './chat-client';

describe('chat preload client', () => {
  test('registers before invoke, filters request events, and cleans up on completion', async () => {
    const sequence: string[] = [];
    const ipc = createFakeIpc(sequence);
    const received: ChatStreamEvent[] = [];
    ipc.invoke.mockImplementation(async (_channel, request) => {
      sequence.push('invoke');
      ipc.emit({
        requestId: 'another-request',
        type: 'delta',
        conversationId: 'conversation-1',
        delta: '忽略',
      });
      ipc.emit({
        requestId: 'request-1',
        type: 'delta',
        conversationId: 'conversation-1',
        delta: '遥：',
      });
      ipc.emit({
        requestId: 'request-1',
        type: 'complete',
        conversationId: 'conversation-1',
        message: {
          id: 'message-2',
          conversationId: 'conversation-1',
          role: 'assistant',
          content: '遥：你好。',
          createdAt: 2,
          updatedAt: 2,
        },
      });
      return request;
    });

    const client = createChatClient(ipc, () => 'request-1');
    await client.sendMessage({ conversationId: 'conversation-1', content: '你好' }, (event) =>
      received.push(event),
    );

    expect(sequence.slice(0, 2)).toEqual(['on', 'invoke']);
    expect(ipc.invoke).toHaveBeenCalledWith('chat:send-message', {
      requestId: 'request-1',
      conversationId: 'conversation-1',
      content: '你好',
    });
    expect(received.map((event) => event.type)).toEqual(['delta', 'complete']);
    expect(ipc.listenerCount()).toBe(0);
  });

  test.each(['complete', 'error'] as const)('cleans up after a %s event', async (type) => {
    const ipc = createFakeIpc();
    ipc.invoke.mockImplementation(async () => {
      ipc.emit(
        type === 'complete'
          ? {
              requestId: 'request-1',
              type,
              conversationId: 'conversation-1',
              message: {
                id: 'message-2',
                conversationId: 'conversation-1',
                role: 'assistant',
                content: '完成',
                createdAt: 2,
                updatedAt: 2,
              },
            }
          : {
              requestId: 'request-1',
              type,
              conversationId: 'conversation-1',
              message: '失败',
            },
      );
    });

    await createChatClient(ipc, () => 'request-1').sendMessage(
      { conversationId: 'conversation-1', content: '你好' },
      () => undefined,
    );

    expect(ipc.listenerCount()).toBe(0);
  });

  test('cleans up when invoking the main process rejects', async () => {
    const ipc = createFakeIpc();
    ipc.invoke.mockRejectedValue(new Error('IPC unavailable'));

    await expect(
      createChatClient(ipc, () => 'request-1').sendMessage(
        { conversationId: 'conversation-1', content: '你好' },
        () => undefined,
      ),
    ).rejects.toThrow('IPC unavailable');
    expect(ipc.listenerCount()).toBe(0);
  });
});

type ChatListener = Parameters<ChatIpcRenderer['on']>[1];

function createFakeIpc(sequence: string[] = []): ChatIpcRenderer & {
  invoke: ReturnType<typeof vi.fn>;
  emit(event: ChatStreamEvent): void;
  listenerCount(): number;
} {
  const listeners = new Set<ChatListener>();
  const invoke = vi.fn();

  return {
    invoke,
    on: (_channel, listener) => {
      sequence.push('on');
      listeners.add(listener);
    },
    removeListener: (_channel, listener) => {
      listeners.delete(listener);
    },
    emit: (event) => {
      for (const listener of listeners) {
        listener({}, event);
      }
    },
    listenerCount: () => listeners.size,
  };
}
