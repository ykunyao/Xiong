import { describe, expect, test } from 'vitest';
import { createMockChatProvider } from './chat-provider';

describe('createMockChatProvider', () => {
  test('streams the exact deterministic character reply', async () => {
    const provider = createMockChatProvider({ chunkSize: 4, delayMs: 0 });
    const chunks: string[] = [];

    for await (const chunk of provider.stream({
      characterName: '遥',
      messages: [
        { role: 'system', content: '你正在扮演遥。' },
        { role: 'user', content: '上一条消息' },
        { role: 'assistant', content: '上一条回复' },
        { role: 'user', content: '你好🙂' },
      ],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toEqual(['遥：我收', '到了你的', '消息：“', '你好🙂”']);
    expect(chunks.join('')).toBe('遥：我收到了你的消息：“你好🙂”');
  });

  test('requires at least one user message', async () => {
    const provider = createMockChatProvider({ delayMs: 0 });

    await expect(async () => {
      for await (const chunk of provider.stream({
        characterName: '遥',
        messages: [{ role: 'system', content: '你正在扮演遥。' }],
      })) {
        throw new Error(`Unexpected chunk: ${chunk}`);
      }
    }).rejects.toThrow('Chat provider request must include a user message');
  });

  test.each([0, -1, 1.5])('rejects invalid chunk size %s', (chunkSize) => {
    expect(() => createMockChatProvider({ chunkSize })).toThrow(
      'Mock provider chunk size must be a positive integer',
    );
  });
});
