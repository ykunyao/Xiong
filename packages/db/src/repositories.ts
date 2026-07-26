import { asc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { XiongDatabase } from './database';
import {
  characters,
  conversations,
  messages,
  type CharacterRecord,
  type ConversationRecord,
  type MessageRecord,
  type MessageRole,
} from './schema';

export interface CreateCharacterInput {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
}

export interface CreateConversationInput {
  characterId: string;
  title: string;
}

export interface AddMessageInput {
  conversationId: string;
  role: MessageRole;
  content: string;
}

export interface LibraryRepository {
  listCharacters(): CharacterRecord[];
  getCharacter(id: string): CharacterRecord | undefined;
  createCharacter(input: CreateCharacterInput): CharacterRecord;
  listConversations(characterId: string): ConversationRecord[];
  getConversation(id: string): ConversationRecord | undefined;
  createConversation(input: CreateConversationInput): ConversationRecord;
  listMessages(conversationId: string): MessageRecord[];
  addMessage(input: AddMessageInput): MessageRecord;
}

export function createLibraryRepository(database: XiongDatabase): LibraryRepository {
  return {
    listCharacters: () =>
      database.db.select().from(characters).orderBy(asc(characters.createdAt)).all(),

    getCharacter: (id) => database.db.select().from(characters).where(eq(characters.id, id)).get(),

    createCharacter: (input) => {
      const now = Date.now();
      const record = {
        id: randomUUID(),
        name: input.name,
        description: input.description ?? '',
        personality: input.personality ?? '',
        scenario: input.scenario ?? '',
        firstMessage: input.firstMessage ?? '',
        createdAt: now,
        updatedAt: now,
      };

      database.db.insert(characters).values(record).run();
      return record;
    },

    listConversations: (characterId) =>
      database.db
        .select()
        .from(conversations)
        .where(eq(conversations.characterId, characterId))
        .orderBy(asc(conversations.createdAt))
        .all(),

    getConversation: (id) =>
      database.db.select().from(conversations).where(eq(conversations.id, id)).get(),

    createConversation: (input) => {
      const now = Date.now();
      const record = {
        id: randomUUID(),
        characterId: input.characterId,
        title: input.title,
        createdAt: now,
        updatedAt: now,
      };

      database.db.insert(conversations).values(record).run();
      return record;
    },

    listMessages: (conversationId) =>
      database.db
        .select()
        .from(messages)
        .where(eq(messages.conversationId, conversationId))
        .orderBy(asc(messages.createdAt))
        .all(),

    addMessage: (input) => {
      const now = Date.now();
      const record = {
        id: randomUUID(),
        conversationId: input.conversationId,
        role: input.role,
        content: input.content,
        createdAt: now,
        updatedAt: now,
      };

      database.db.insert(messages).values(record).run();
      return record;
    },
  };
}
