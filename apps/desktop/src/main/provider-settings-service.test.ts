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
import {
  defaultOpenAICompatibleGenerationParams,
  type OpenAICompatibleGenerationParams,
} from '../shared/provider-settings';
import type { OpenAICompatibleChatProviderConfig } from './openai-compatible-chat-provider';

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
    onCreateProvider?: (config: OpenAICompatibleChatProviderConfig) => void;
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
          ...defaultOpenAICompatibleGenerationParams,
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
    const providerConfigs: OpenAICompatibleChatProviderConfig[] = [];
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
        temperature: 0.65,
        maxOutputTokens: 3072,
        requestTimeoutMs: 45_000,
      });

      await expect(service.resolveChatProvider()).resolves.toBe(realProvider);
      expect(providerConfigs).toEqual([
        {
          baseUrl: 'https://provider.example/v1',
          model: 'roleplay-model',
          apiKey: 'plain-secret',
          temperature: 0.65,
          maxOutputTokens: 3072,
          requestTimeoutMs: 45_000,
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
        temperature: 0.4,
        maxOutputTokens: 4096,
        requestTimeoutMs: 120_000,
      });
      await service.resolveChatProvider();

      const config = repository.getOpenAICompatibleConfig()!;
      expect(repository.getEncryptedSecret(config.apiKeyRef!)).toBe('encrypted:rotated');
      expect(config.params).toEqual({
        temperature: 0.4,
        maxOutputTokens: 4096,
        requestTimeoutMs: 120_000,
      });
    } finally {
      database.close();
    }
  });

  test('does not let delayed secret rotation overwrite a concurrent settings save', async () => {
    const decryptStarted = createDeferred<void>();
    const releaseDecrypt = createDeferred<{
      value: string;
      reencryptedValue: string;
    }>();
    const codec = createFakeCodec({
      status: 'available',
      encrypt: async (value) => `encrypted:${value}`,
      decrypt: async (encryptedValue) => {
        expect(encryptedValue).toBe('encrypted:old-secret');
        decryptStarted.resolve(undefined);
        return releaseDecrypt.promise;
      },
    });
    const { database, repository, service } = createTestService({ codec });

    try {
      await service.saveSettings({
        activeProvider: 'openai-compatible',
        baseUrl: 'https://old.example/v1',
        model: 'old-model',
        apiKey: 'old-secret',
        temperature: 0.4,
        maxOutputTokens: 1024,
        requestTimeoutMs: 30_000,
      });
      const resolving = service.resolveChatProvider();
      await decryptStarted.promise;

      try {
        await service.saveSettings({
          activeProvider: 'openai-compatible',
          baseUrl: 'https://new.example/v1',
          model: 'new-model',
          apiKey: 'new-secret',
          temperature: 0.65,
          maxOutputTokens: 4096,
          requestTimeoutMs: 90_000,
        });
      } finally {
        releaseDecrypt.resolve({
          value: 'old-secret',
          reencryptedValue: 'encrypted:old-rotated',
        });
      }
      await resolving;

      const current = repository.getOpenAICompatibleConfig()!;
      expect(current).toMatchObject({
        baseUrl: 'https://new.example/v1',
        defaultModel: 'new-model',
        params: {
          temperature: 0.65,
          maxOutputTokens: 4096,
          requestTimeoutMs: 90_000,
        },
        isActive: true,
      });
      expect(repository.getEncryptedSecret(current.apiKeyRef!)).toBe('encrypted:new-secret');
    } finally {
      database.close();
    }
  });

  test('does not let delayed secret rotation restore a concurrently cleared key', async () => {
    const decryptStarted = createDeferred<void>();
    const releaseDecrypt = createDeferred<{
      value: string;
      reencryptedValue: string;
    }>();
    const codec = createFakeCodec({
      status: 'available',
      encrypt: async (value) => `encrypted:${value}`,
      decrypt: async (encryptedValue) => {
        expect(encryptedValue).toBe('encrypted:old-secret');
        decryptStarted.resolve(undefined);
        return releaseDecrypt.promise;
      },
    });
    const { database, repository, service } = createTestService({ codec });

    try {
      await service.saveSettings({
        activeProvider: 'openai-compatible',
        baseUrl: 'https://provider.example/v1',
        model: 'old-model',
        apiKey: 'old-secret',
      });
      const resolving = service.resolveChatProvider();
      await decryptStarted.promise;

      try {
        await service.saveSettings({
          activeProvider: 'openai-compatible',
          baseUrl: 'https://provider.example/v2',
          model: 'cleared-model',
          clearApiKey: true,
          temperature: 0.65,
          maxOutputTokens: 2048,
          requestTimeoutMs: 60_000,
        });
      } finally {
        releaseDecrypt.resolve({
          value: 'old-secret',
          reencryptedValue: 'encrypted:must-not-return',
        });
      }
      await resolving;

      expect(repository.getOpenAICompatibleConfig()).toMatchObject({
        baseUrl: 'https://provider.example/v2',
        defaultModel: 'cleared-model',
        apiKeyRef: null,
        params: {
          temperature: 0.65,
          maxOutputTokens: 2048,
          requestTimeoutMs: 60_000,
        },
        isActive: true,
      });
      expect(repository.getEncryptedSecret('openai-compatible-default-api-key')).toBeUndefined();
    } finally {
      database.close();
    }
  });

  test('uses safe defaults for a legacy config with missing or invalid params', async () => {
    const providerConfigs: OpenAICompatibleChatProviderConfig[] = [];
    const { database, repository, service } = createTestService({
      onCreateProvider: (config) => providerConfigs.push(config),
    });

    try {
      repository.saveOpenAICompatibleConfig({
        baseUrl: 'https://provider.example/v1',
        defaultModel: 'legacy-model',
        params: {
          temperature: 'hot',
          maxOutputTokens: -1,
        },
        activate: true,
      });

      await expect(service.getSettings()).resolves.toMatchObject({
        openAICompatible: defaultOpenAICompatibleGenerationParams,
      });
      await service.resolveChatProvider();
      expect(providerConfigs[0]).toMatchObject(defaultOpenAICompatibleGenerationParams);
    } finally {
      database.close();
    }
  });

  test.each([
    ['temperature', { temperature: -0.1 }, 'temperature-out-of-range'],
    ['temperature', { temperature: 2.1 }, 'temperature-out-of-range'],
    ['maxOutputTokens', { maxOutputTokens: 0 }, 'max-output-tokens-out-of-range'],
    ['maxOutputTokens', { maxOutputTokens: 1.5 }, 'max-output-tokens-out-of-range'],
    ['maxOutputTokens', { maxOutputTokens: 32_769 }, 'max-output-tokens-out-of-range'],
    ['requestTimeoutMs', { requestTimeoutMs: 999 }, 'request-timeout-out-of-range'],
    ['requestTimeoutMs', { requestTimeoutMs: 1_500 }, 'request-timeout-out-of-range'],
    ['requestTimeoutMs', { requestTimeoutMs: 601_000 }, 'request-timeout-out-of-range'],
  ] as const)('rejects invalid %s settings in the service', async (_field, override, code) => {
    const { database, repository, service } = createTestService();
    const params: OpenAICompatibleGenerationParams = {
      ...defaultOpenAICompatibleGenerationParams,
      ...override,
    };

    try {
      await expect(
        service.saveSettings({
          activeProvider: 'openai-compatible',
          baseUrl: 'https://provider.example/v1',
          model: 'model-one',
          ...params,
        }),
      ).rejects.toMatchObject({ code });
      expect(repository.getOpenAICompatibleConfig()).toBeUndefined();
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

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
}

function createDeferred<T>(): Deferred<T> {
  let resolvePromise: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}
