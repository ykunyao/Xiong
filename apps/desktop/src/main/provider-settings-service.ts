import type { ChatProvider } from '@xiong/core';
import type { ProviderConfigRepository } from '@xiong/db';
import type {
  ProviderSettingsView,
  SaveProviderSettingsInput,
  SecretStorageStatus,
} from '../shared/provider-settings';
import type { OpenAICompatibleChatProviderConfig } from './openai-compatible-chat-provider';

export const defaultOpenAICompatibleBaseUrl = 'https://api.openai.com/v1';

export type ProviderSettingsErrorCode =
  | 'invalid-base-url'
  | 'model-required'
  | 'secret-storage-unavailable'
  | 'secret-storage-insecure'
  | 'secret-decryption-failed'
  | 'provider-not-configured';

export class ProviderSettingsError extends Error {
  constructor(
    readonly code: ProviderSettingsErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ProviderSettingsError';
  }
}

export interface DecryptedProviderSecret {
  value: string;
  reencryptedValue?: string;
}

export interface ProviderSecretCodec {
  getStatus(): Promise<SecretStorageStatus>;
  encrypt(value: string): Promise<string>;
  decrypt(encryptedValue: string): Promise<DecryptedProviderSecret>;
}

export interface ProviderSettingsService {
  getSettings(): Promise<ProviderSettingsView>;
  saveSettings(input: SaveProviderSettingsInput): Promise<ProviderSettingsView>;
  resolveChatProvider(): Promise<ChatProvider>;
}

export interface ProviderSettingsServiceDependencies {
  repository: ProviderConfigRepository;
  secretCodec: ProviderSecretCodec;
  mockProvider: ChatProvider;
  createOpenAICompatibleProvider(config: OpenAICompatibleChatProviderConfig): ChatProvider;
}

export function createProviderSettingsService(
  dependencies: ProviderSettingsServiceDependencies,
): ProviderSettingsService {
  const { repository, secretCodec, mockProvider, createOpenAICompatibleProvider } = dependencies;

  async function getSettings(): Promise<ProviderSettingsView> {
    const config = repository.getOpenAICompatibleConfig();
    return {
      activeProvider: repository.getActiveProviderType(),
      openAICompatible: {
        baseUrl: config?.baseUrl ?? defaultOpenAICompatibleBaseUrl,
        model: config?.defaultModel ?? '',
        hasApiKey: Boolean(config?.apiKeyRef),
      },
      secretStorageStatus: await secretCodec.getStatus(),
    };
  }

  return {
    getSettings,

    async saveSettings(input) {
      if (input.activeProvider === 'mock') {
        repository.setActiveProvider('mock');
        return getSettings();
      }

      const baseUrl = normalizeProviderBaseUrl(input.baseUrl);
      const model = input.model.trim();
      if (!model) {
        throw new ProviderSettingsError('model-required', 'A model id is required');
      }

      const apiKey = input.apiKey?.trim() ?? '';
      let encryptedApiKey: string | null | undefined;
      if (input.clearApiKey) {
        encryptedApiKey = null;
      } else if (apiKey) {
        const status = await secretCodec.getStatus();
        if (status === 'unavailable') {
          throw new ProviderSettingsError(
            'secret-storage-unavailable',
            'Secure secret storage is unavailable',
          );
        }
        if (status === 'insecure') {
          throw new ProviderSettingsError(
            'secret-storage-insecure',
            'The selected secret storage backend is insecure',
          );
        }

        encryptedApiKey = await secretCodec.encrypt(apiKey);
      }

      repository.saveOpenAICompatibleConfig({
        baseUrl,
        defaultModel: model,
        ...(encryptedApiKey === undefined ? {} : { encryptedApiKey }),
        activate: true,
      });
      return getSettings();
    },

    async resolveChatProvider() {
      if (repository.getActiveProviderType() === 'mock') {
        return mockProvider;
      }

      const config = repository.getOpenAICompatibleConfig();
      if (!config?.baseUrl || !config.defaultModel || !config.isActive) {
        throw new ProviderSettingsError(
          'provider-not-configured',
          'OpenAI Compatible provider is not configured',
        );
      }

      let apiKey: string | undefined;
      if (config.apiKeyRef) {
        const encryptedValue = repository.getEncryptedSecret(config.apiKeyRef);
        if (!encryptedValue) {
          throw new ProviderSettingsError(
            'secret-decryption-failed',
            'The stored API key cannot be found',
          );
        }

        try {
          const decrypted = await secretCodec.decrypt(encryptedValue);
          apiKey = decrypted.value;
          if (decrypted.reencryptedValue) {
            repository.saveOpenAICompatibleConfig({
              baseUrl: config.baseUrl,
              defaultModel: config.defaultModel,
              encryptedApiKey: decrypted.reencryptedValue,
              activate: true,
            });
          }
        } catch (error) {
          if (error instanceof ProviderSettingsError) {
            throw error;
          }
          throw new ProviderSettingsError(
            'secret-decryption-failed',
            'The stored API key cannot be decrypted',
            { cause: error },
          );
        }
      }

      return createOpenAICompatibleProvider({
        baseUrl: config.baseUrl,
        model: config.defaultModel,
        ...(apiKey ? { apiKey } : {}),
      });
    },
  };
}

export function normalizeProviderBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch (error) {
    throw new ProviderSettingsError('invalid-base-url', 'Provider base URL is invalid', {
      cause: error,
    });
  }

  if (url.username || url.password || url.search || url.hash) {
    throw new ProviderSettingsError(
      'invalid-base-url',
      'Provider base URL cannot include credentials, query parameters, or a fragment',
    );
  }

  const loopbackHosts = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
  if (url.protocol === 'http:' && !loopbackHosts.has(url.hostname)) {
    throw new ProviderSettingsError(
      'invalid-base-url',
      'Plain HTTP provider URLs are allowed only for loopback hosts',
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ProviderSettingsError(
      'invalid-base-url',
      'Provider base URL must use HTTPS or local HTTP',
    );
  }

  return url.toString().replace(/\/+$/, '');
}
