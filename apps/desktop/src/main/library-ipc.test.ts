import { describe, expect, test } from 'vitest';
import {
  parseAddMessageInput,
  parseCreateCharacterInput,
  parseCreateConversationInput,
} from './library-ipc';

describe('library ipc input validation', () => {
  test('rejects empty character names', () => {
    expect(() => parseCreateCharacterInput({ name: '   ' })).toThrow('Character name is required');
  });

  test('accepts optional character fields', () => {
    expect(
      parseCreateCharacterInput({
        name: '遥',
        description: '旅伴',
        firstMessage: '你终于来了。',
      }),
    ).toEqual({
      name: '遥',
      description: '旅伴',
      personality: '',
      scenario: '',
      firstMessage: '你终于来了。',
    });
  });

  test('rejects empty conversation character id', () => {
    expect(() =>
      parseCreateConversationInput({
        characterId: '',
        title: '初次见面',
      }),
    ).toThrow('Character id is required');
  });

  test('rejects invalid message roles', () => {
    expect(() =>
      parseAddMessageInput({
        conversationId: 'conversation-1',
        role: 'tool',
        content: 'hello',
      }),
    ).toThrow('Message role is invalid');
  });

  test('rejects empty message content', () => {
    expect(() =>
      parseAddMessageInput({
        conversationId: 'conversation-1',
        role: 'user',
        content: '   ',
      }),
    ).toThrow('Message content is required');
  });
});
