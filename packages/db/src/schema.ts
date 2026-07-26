import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const characters = sqliteTable('characters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  personality: text('personality').notNull().default(''),
  scenario: text('scenario').notNull().default(''),
  firstMessage: text('first_message').notNull().default(''),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const conversations = sqliteTable('conversations', {
  id: text('id').primaryKey(),
  characterId: text('character_id')
    .notNull()
    .references(() => characters.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => conversations.id, { onDelete: 'cascade' }),
  role: text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const providerSecrets = sqliteTable('provider_secrets', {
  id: text('id').primaryKey(),
  encryptedValue: text('encrypted_value').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const providerConfigs = sqliteTable('provider_configs', {
  id: text('id').primaryKey(),
  type: text('type', { enum: ['openai-compatible'] }).notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url'),
  apiKeyRef: text('api_key_ref').references(() => providerSecrets.id, {
    onDelete: 'set null',
  }),
  defaultModel: text('default_model'),
  params: text('params_json', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type CharacterRecord = typeof characters.$inferSelect;
export type ConversationRecord = typeof conversations.$inferSelect;
export type MessageRecord = typeof messages.$inferSelect;
export type MessageRole = MessageRecord['role'];
export type ProviderConfigRecord = typeof providerConfigs.$inferSelect;
export type ProviderSecretRecord = typeof providerSecrets.$inferSelect;
