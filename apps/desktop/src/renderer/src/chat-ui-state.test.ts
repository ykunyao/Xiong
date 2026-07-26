import type { MessageRecord } from '@xiong/db';
import { describe, expect, test } from 'vitest';
import {
  appendMessageIfMissing,
  chatActivityReducer,
  initialChatActivityState,
} from './chat-ui-state';

describe('chat UI state', () => {
  test('tracks generation independently by conversation', () => {
    const first = chatActivityReducer(initialChatActivityState, {
      type: 'start',
      conversationId: 'conversation-1',
    });
    const second = chatActivityReducer(first, {
      type: 'start',
      conversationId: 'conversation-2',
    });

    expect(second.generatingConversationIds).toEqual(['conversation-1', 'conversation-2']);
  });

  test('accumulates matching deltas and clears them after completion', () => {
    const started = chatActivityReducer(initialChatActivityState, {
      type: 'start',
      conversationId: 'conversation-1',
    });
    const firstDelta = chatActivityReducer(started, {
      type: 'event',
      event: {
        requestId: 'request-1',
        type: 'delta',
        conversationId: 'conversation-1',
        delta: '遥：',
      },
    });
    const secondDelta = chatActivityReducer(firstDelta, {
      type: 'event',
      event: {
        requestId: 'request-1',
        type: 'delta',
        conversationId: 'conversation-1',
        delta: '你好。',
      },
    });

    expect(secondDelta.streamingReplies['conversation-1']).toBe('遥：你好。');

    const completed = chatActivityReducer(secondDelta, {
      type: 'finish',
      conversationId: 'conversation-1',
    });
    expect(completed.generatingConversationIds).toEqual([]);
    expect(completed.streamingReplies['conversation-1']).toBeUndefined();
  });

  test('appends a persisted message only once', () => {
    const message: MessageRecord = {
      id: 'message-1',
      conversationId: 'conversation-1',
      role: 'user',
      content: '你好',
      createdAt: 1,
      updatedAt: 1,
    };

    expect(appendMessageIfMissing([message], message)).toEqual([message]);
    expect(appendMessageIfMissing([], message)).toEqual([message]);
  });
});
