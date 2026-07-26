import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

export interface XiongDatabase {
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  close(): void;
}

export function createXiongDatabase(path: string): XiongDatabase {
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('journal_mode = WAL');
  createTables(sqlite);

  return {
    sqlite,
    db: drizzle(sqlite, { schema }),
    close: () => sqlite.close(),
  };
}

function createTables(sqlite: Database.Database): void {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      personality TEXT NOT NULL DEFAULT '',
      scenario TEXT NOT NULL DEFAULT '',
      first_message TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      character_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS provider_secrets (
      id TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_configs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('openai-compatible')),
      name TEXT NOT NULL,
      base_url TEXT,
      api_key_ref TEXT,
      default_model TEXT,
      params_json TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (api_key_ref) REFERENCES provider_secrets(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS conversations_character_id_idx
      ON conversations(character_id);

    CREATE INDEX IF NOT EXISTS messages_conversation_id_created_at_idx
      ON messages(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS provider_configs_is_active_idx
      ON provider_configs(is_active);
  `);
}
