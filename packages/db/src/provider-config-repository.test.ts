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
        params: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          requestTimeoutMs: 60_000,
        },
        activate: true,
      });

      expect(config).toMatchObject({
        id: defaultOpenAICompatibleProviderId,
        type: 'openai-compatible',
        name: 'OpenAI Compatible',
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'roleplay-model',
        params: {
          temperature: 0.7,
          maxOutputTokens: 2048,
          requestTimeoutMs: 60_000,
        },
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

  test('updates params on conflict and preserves them during secret-only rotation', () => {
    const { database, repository } = createTestRepository();

    try {
      repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'model-one',
        encryptedApiKey: 'encrypted-key-one',
        params: {
          temperature: 0.5,
          maxOutputTokens: 1024,
          requestTimeoutMs: 30_000,
        },
        activate: true,
      });

      const updated = repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'model-one',
        params: {
          temperature: 1.2,
          maxOutputTokens: 4096,
          requestTimeoutMs: 90_000,
        },
        activate: true,
      });
      expect(updated.params).toEqual({
        temperature: 1.2,
        maxOutputTokens: 4096,
        requestTimeoutMs: 90_000,
      });

      const rotated = repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'model-one',
        encryptedApiKey: 'encrypted-key-rotated',
        activate: true,
      });
      expect(rotated.params).toEqual(updated.params);
    } finally {
      database.close();
    }
  });

  test('rotates only the matching current secret without changing provider config fields', () => {
    const { database, repository } = createTestRepository();

    try {
      const config = repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'model-one',
        encryptedApiKey: 'encrypted-key-one',
        params: {
          temperature: 0.65,
          maxOutputTokens: 4096,
          requestTimeoutMs: 90_000,
        },
        activate: true,
      });
      const configBeforeRotation = repository.getOpenAICompatibleConfig();

      expect(
        repository.rotateEncryptedSecretIfUnchanged({
          apiKeyRef: config.apiKeyRef!,
          expectedEncryptedValue: 'encrypted-key-one',
          encryptedValue: 'encrypted-key-rotated',
        }),
      ).toBe(true);
      expect(repository.getEncryptedSecret(config.apiKeyRef!)).toBe('encrypted-key-rotated');
      expect(repository.getOpenAICompatibleConfig()).toEqual(configBeforeRotation);

      expect(
        repository.rotateEncryptedSecretIfUnchanged({
          apiKeyRef: config.apiKeyRef!,
          expectedEncryptedValue: 'encrypted-key-one',
          encryptedValue: 'stale-rotation',
        }),
      ).toBe(false);
      expect(repository.getEncryptedSecret(config.apiKeyRef!)).toBe('encrypted-key-rotated');

      repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v2',
        defaultModel: 'model-two',
        encryptedApiKey: null,
        params: { temperature: 1 },
        activate: false,
      });
      expect(
        repository.rotateEncryptedSecretIfUnchanged({
          apiKeyRef: config.apiKeyRef!,
          expectedEncryptedValue: 'encrypted-key-rotated',
          encryptedValue: 'must-not-return',
        }),
      ).toBe(false);
      expect(repository.getEncryptedSecret(config.apiKeyRef!)).toBeUndefined();
      expect(repository.getOpenAICompatibleConfig()).toMatchObject({
        baseUrl: 'https://provider.example/v2',
        defaultModel: 'model-two',
        apiKeyRef: null,
        params: { temperature: 1 },
        isActive: false,
      });
    } finally {
      database.close();
    }
  });
});
