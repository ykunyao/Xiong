import { describe, expect, test } from 'vitest';
import { createMockChatProvider } from './chat-provider';

describe('createMockChatProvider', () => {
  test('streams the exact deterministic character reply', async () => {
    const provider = createMockChatProvider({ chunkSize: 4, delayMs: 0 });
    const chunks: string[] = [];

    for await (const chunk of provider.stream({
      characterName: '遥',
      userText: '你好🙂',
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['遥：我收', '到了你的', '消息：“', '你好🙂”']);
    expect(chunks.join('')).toBe('遥：我收到了你的消息：“你好🙂”');
  });

  test.each([0, -1, 1.5])('rejects invalid chunk size %s', (chunkSize) => {
    expect(() => createMockChatProvider({ chunkSize })).toThrow(
      'Mock provider chunk size must be a positive integer',
    );
  });
});
