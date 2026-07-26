import type { ChatProvider } from '@xiong/core';
import { createProviderConfigRepository } from '@xiong/db';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { createXiongDatabase } from '@xiong/db';
import {
  createProviderSettingsService,
  defaultOpenAICompatibleBaseUrl,
  type ProviderSecretCodec,
} from './provider-settings-service';

const mockProvider: ChatProvider = {
  async *stream() {
    yield 'mock';
  },
};

const realProvider: ChatProvider = {
  async *stream() {
    yield 'real';
  },
};

function createTestService(
  options: {
    codec?: ProviderSecretCodec;
    onCreateProvider?: (config: { baseUrl: string; model: string; apiKey?: string }) => void;
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), 'xiong-provider-service-'));
  const database = createXiongDatabase(join(directory, 'xiong.sqlite'));
  const repository = createProviderConfigRepository(database);
  const codec =
    options.codec ??
    createFakeCodec({
      status: 'available',
      encrypt: async (value) => `encrypted:${value}`,
      decrypt: async (value) => ({ value: value.replace(/^encrypted:/, '') }),
    });
  const service = createProviderSettingsService({
    repository,
    secretCodec: codec,
    mockProvider,
    createOpenAICompatibleProvider: (config) => {
      options.onCreateProvider?.(config);
      return realProvider;
    },
  });

  return { database, repository, service };
}

describe('provider settings service', () => {
  test('defaults to Mock and exposes no secret material', async () => {
    const { database, service } = createTestService();

    try {
      await expect(service.getSettings()).resolves.toEqual({
        activeProvider: 'mock',
        openAICompatible: {
          baseUrl: defaultOpenAICompatibleBaseUrl,
          model: '',
          hasApiKey: false,
        },
        secretStorageStatus: 'available',
      });
    } finally {
      database.close();
    }
  });

  test('rejects remote plain HTTP but allows a loopback OpenAI endpoint', async () => {
    const { database, service } = createTestService();

    try {
      await expect(
        service.saveSettings({
          activeProvider: 'openai-compatible',
          baseUrl: 'http://provider.example/v1',
          model: 'model-one',
        }),
      ).rejects.toMatchObject({ code: 'invalid-base-url' });

      await expect(
        service.saveSettings({
          activeProvider: 'openai-compatible',
          baseUrl: 'http://127.0.0.1:1234/v1/',
          model: 'local-model',
        }),
      ).resolves.toMatchObject({
        activeProvider: 'openai-compatible',
        openAICompatible: {
          baseUrl: 'http://127.0.0.1:1234/v1',
          model: 'local-model',
        },
      });
    } finally {
      database.close();
    }
  });

  test('encrypts new keys, preserves blank keys, and clears only explicitly', async () => {
    const { database, repository, service } = createTestService();

    try {
      const saved = await service.saveSettings({
        activeProvider: 'openai-compatible',
        baseUrl: 'https://provider.example/v1',
        model: 'model-one',
        apiKey: 'plain-secret',
      });
      expect(saved.openAICompatible.hasApiKey).toBe(true);
      expect(JSON.stringify(saved)).not.toContain('plain-secret');

      const firstConfig = repository.getOpenAICompatibleConfig()!;
      expect(repository.getEncryptedSecret(firstConfig.apiKeyRef!)).toBe('encrypted:plain-secret');

      await service.saveSettings({
        activeProvider: 'openai-compatible',
        baseUrl: 'https://provider.example/v1',
        model: 'model-two',
        apiKey: '   ',
      });
      const preserved = repository.getOpenAICompatibleConfig()!;
      expect(repository.getEncryptedSecret(preserved.apiKeyRef!)).toBe('encrypted:plain-secret');

      const cleared = await service.saveSettings({
        activeProvider: 'openai-compatible',
        baseUrl: 'https://provider.example/v1',
        model: 'model-two',
        clearApiKey: true,
      });
      expect(cleared.openAICompatible.hasApiKey).toBe(false);
      expect(repository.getOpenAICompatibleConfig()?.apiKeyRef).toBeNull();
    } finally {
      database.close();
    }
  });

  test('does not persist a key when secure storage is unavailable', async () => {
    const codec = createFakeCodec({ status: 'unavailable' });
    const { database, repository, service } = createTestService({ codec });

    try {
      await expect(
        service.saveSettings({
          activeProvider: 'openai-compatible',
          baseUrl: 'https://provider.example/v1',
          model: 'model-one',
          apiKey: 'plain-secret',
        }),
      ).rejects.toMatchObject({ code: 'secret-storage-unavailable' });
      expect(repository.getOpenAICompatibleConfig()).toBeUndefined();
    } finally {
      database.close();
    }
  });

  test('resolves Mock by default and decrypts the active real provider key', async () => {
    const providerConfigs: Array<{ baseUrl: string; model: string; apiKey?: string }> = [];
    const { database, service } = createTestService({
      onCreateProvider: (config) => providerConfigs.push(config),
    });

    try {
      await expect(service.resolveChatProvider()).resolves.toBe(mockProvider);

      await service.saveSettings({
        activeProvider: 'openai-compatible',
        baseUrl: 'https://provider.example/v1',
        model: 'roleplay-model',
        apiKey: 'plain-secret',
      });

      await expect(service.resolveChatProvider()).resolves.toBe(realProvider);
      expect(providerConfigs).toEqual([
        {
          baseUrl: 'https://provider.example/v1',
          model: 'roleplay-model',
          apiKey: 'plain-secret',
        },
      ]);

      await service.saveSettings({
        activeProvider: 'mock',
        baseUrl: '',
        model: '',
      });
      await expect(service.resolveChatProvider()).resolves.toBe(mockProvider);
    } finally {
      database.close();
    }
  });

  test('persists a rotated encrypted value after decryption', async () => {
    const codec = createFakeCodec({
      status: 'available',
      encrypt: async () => 'encrypted:initial',
      decrypt: async () => ({
        value: 'plain-secret',
        reencryptedValue: 'encrypted:rotated',
      }),
    });
    const { database, repository, service } = createTestService({ codec });

    try {
      await service.saveSettings({
        activeProvider: 'openai-compatible',
        baseUrl: 'https://provider.example/v1',
        model: 'model-one',
        apiKey: 'plain-secret',
      });
      await service.resolveChatProvider();

      const config = repository.getOpenAICompatibleConfig()!;
      expect(repository.getEncryptedSecret(config.apiKeyRef!)).toBe('encrypted:rotated');
    } finally {
      database.close();
    }
  });
});

function createFakeCodec(options: {
  status: ProviderSecretCodec['getStatus'] extends () => Promise<infer T> ? T : never;
  encrypt?: ProviderSecretCodec['encrypt'];
  decrypt?: ProviderSecretCodec['decrypt'];
}): ProviderSecretCodec {
  return {
    getStatus: async () => options.status,
    encrypt:
      options.encrypt ??
      (async () => {
        throw new Error('Unexpected encrypt call');
      }),
    decrypt:
      options.decrypt ??
      (async () => {
        throw new Error('Unexpected decrypt call');
      }),
  };
}
