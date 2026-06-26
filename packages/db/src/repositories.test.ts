import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createXiongDatabase } from './database';
import { createLibraryRepository } from './repositories';

function createTestRepository() {
  const dir = mkdtempSync(join(tmpdir(), 'xiong-db-'));
  const database = createXiongDatabase(join(dir, 'xiong.sqlite'));
  return {
    database,
    repository: createLibraryRepository(database),
  };
}

describe('library repository', () => {
  test('creates and lists characters, conversations, and ordered messages', () => {
    const { database, repository } = createTestRepository();

    try {
      const character = repository.createCharacter({
        name: '遥',
        description: '温柔但有点嘴硬的旅伴。',
        firstMessage: '你终于来了。',
      });
      const conversation = repository.createConversation({
        characterId: character.id,
        title: '初次见面',
      });
      const userMessage = repository.addMessage({
        conversationId: conversation.id,
        role: 'user',
        content: '晚上好。',
      });
      const assistantMessage = repository.addMessage({
        conversationId: conversation.id,
        role: 'assistant',
        content: '晚上好，路上冷吗？',
      });

      expect(repository.listCharacters()).toMatchObject([
        {
          id: character.id,
          name: '遥',
          description: '温柔但有点嘴硬的旅伴。',
          firstMessage: '你终于来了。',
        },
      ]);
      expect(repository.listConversations(character.id)).toMatchObject([
        {
          id: conversation.id,
          characterId: character.id,
          title: '初次见面',
        },
      ]);
      expect(repository.listMessages(conversation.id).map((message) => message.id)).toEqual([
        userMessage.id,
        assistantMessage.id,
      ]);
    } finally {
      database.close();
    }
  });

  test('enforces conversation foreign keys', () => {
    const { database, repository } = createTestRepository();

    try {
      expect(() =>
        repository.createConversation({
          characterId: 'missing-character',
          title: '不会成功',
        }),
      ).toThrow();
    } finally {
      database.close();
    }
  });
});
