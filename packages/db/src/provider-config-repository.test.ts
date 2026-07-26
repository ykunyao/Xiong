import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createXiongDatabase } from './database';
import {
  createProviderConfigRepository,
  defaultOpenAICompatibleProviderId,
} from './provider-config-repository';

function createTestRepository() {
  const dir = mkdtempSync(join(tmpdir(), 'xiong-provider-db-'));
  const database = createXiongDatabase(join(dir, 'xiong.sqlite'));
  return {
    database,
    repository: createProviderConfigRepository(database),
  };
}

describe('provider config repository', () => {
  test('defaults to Mock and persists one active OpenAI Compatible config', () => {
    const { database, repository } = createTestRepository();

    try {
      expect(repository.getActiveProviderType()).toBe('mock');
      expect(repository.getOpenAICompatibleConfig()).toBeUndefined();

      const config = repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'roleplay-model',
        encryptedApiKey: 'encrypted-key-one',
        activate: true,
      });

      expect(config).toMatchObject({
        id: defaultOpenAICompatibleProviderId,
        type: 'openai-compatible',
        name: 'OpenAI Compatible',
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'roleplay-model',
        isActive: true,
      });
      expect(config.apiKeyRef).toBeTruthy();
      expect(repository.getEncryptedSecret(config.apiKeyRef!)).toBe('encrypted-key-one');
      expect(repository.getActiveProviderType()).toBe('openai-compatible');
    } finally {
      database.close();
    }
  });

  test('preserves, replaces, and clears the encrypted key explicitly', () => {
    const { database, repository } = createTestRepository();

    try {
      const initial = repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'model-one',
        encryptedApiKey: 'encrypted-key-one',
        activate: true,
      });
      const preserved = repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'model-two',
        activate: true,
      });

      expect(preserved.apiKeyRef).toBe(initial.apiKeyRef);
      expect(repository.getEncryptedSecret(preserved.apiKeyRef!)).toBe('encrypted-key-one');

      const replaced = repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'model-two',
        encryptedApiKey: 'encrypted-key-two',
        activate: true,
      });
      expect(replaced.apiKeyRef).toBe(initial.apiKeyRef);
      expect(repository.getEncryptedSecret(replaced.apiKeyRef!)).toBe('encrypted-key-two');

      const cleared = repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'model-two',
        encryptedApiKey: null,
        activate: true,
      });
      expect(cleared.apiKeyRef).toBeNull();
      expect(repository.getEncryptedSecret(initial.apiKeyRef!)).toBeUndefined();
    } finally {
      database.close();
    }
  });

  test('switches back to Mock without deleting the real provider config', () => {
    const { database, repository } = createTestRepository();

    try {
      repository.saveOpenAICompatibleConfig({
        baseUrl: 'http://localhost:1234/v1',
        defaultModel: 'local-model',
        activate: true,
      });

      repository.setActiveProvider('mock');

      expect(repository.getActiveProviderType()).toBe('mock');
      expect(repository.getOpenAICompatibleConfig()).toMatchObject({
        baseUrl: 'http://localhost:1234/v1',
        defaultModel: 'local-model',
        isActive: false,
      });
    } finally {
      database.close();
    }
  });
});
