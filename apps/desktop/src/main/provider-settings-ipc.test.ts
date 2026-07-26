import { describe, expect, test, vi } from 'vitest';
import type { ProviderSettingsView } from '../shared/provider-settings';
import {
  parseSaveProviderSettingsInput,
  registerProviderSettingsIpc,
} from './provider-settings-ipc';
import { ProviderSettingsError, type ProviderSettingsService } from './provider-settings-service';
import { defaultOpenAICompatibleGenerationParams } from '../shared/provider-settings';

const settingsView: ProviderSettingsView = {
  activeProvider: 'openai-compatible',
  openAICompatible: {
    baseUrl: 'https://provider.example/v1',
    model: 'roleplay-model',
    hasApiKey: true,
    temperature: 0.7,
    maxOutputTokens: 2048,
    requestTimeoutMs: 60_000,
  },
  secretStorageStatus: 'available',
};

describe('provider settings ipc', () => {
  test('trims and validates an OpenAI Compatible settings request', () => {
    expect(
      parseSaveProviderSettingsInput({
        activeProvider: 'openai-compatible',
        baseUrl: ' https://provider.example/v1 ',
        model: ' roleplay-model ',
        apiKey: ' test-key ',
        temperature: 0.7,
        maxOutputTokens: 2048,
        requestTimeoutMs: 60_000,
      }),
    ).toEqual({
      activeProvider: 'openai-compatible',
      baseUrl: 'https://provider.example/v1',
      model: 'roleplay-model',
      apiKey: 'test-key',
      clearApiKey: false,
      temperature: 0.7,
      maxOutputTokens: 2048,
      requestTimeoutMs: 60_000,
    });
  });

  test.each([
    [
      { activeProvider: 'openai-compatible', baseUrl: '', model: 'model-one' },
      'Provider base URL is required',
    ],
    [
      { activeProvider: 'openai-compatible', baseUrl: 'https://example.com/v1', model: '' },
      'Model id is required',
    ],
    [
      {
        activeProvider: 'openai-compatible',
        baseUrl: 'https://example.com/v1',
        model: 'model-one',
        apiKey: 'key',
        clearApiKey: true,
      },
      'API key cannot be replaced and cleared at the same time',
    ],
    [
      {
        activeProvider: 'openai-compatible',
        baseUrl: 'https://example.com/v1',
        model: 'model-one',
        temperature: 2.01,
      },
      'Temperature must be between 0 and 2',
    ],
    [
      {
        activeProvider: 'openai-compatible',
        baseUrl: 'https://example.com/v1',
        model: 'model-one',
        maxOutputTokens: 32_769,
      },
      'Maximum output tokens must be an integer between 1 and 32768',
    ],
    [
      {
        activeProvider: 'openai-compatible',
        baseUrl: 'https://example.com/v1',
        model: 'model-one',
        requestTimeoutMs: 1_500,
      },
      'Request timeout must be whole seconds between 1 and 600',
    ],
  ])('rejects invalid settings %#', (input, message) => {
    expect(() => parseSaveProviderSettingsInput(input)).toThrow(message);
  });

  test('allows Mock selection without a real-provider config', () => {
    expect(
      parseSaveProviderSettingsInput({
        activeProvider: 'mock',
        baseUrl: '',
        model: '',
      }),
    ).toMatchObject({
      activeProvider: 'mock',
      baseUrl: '',
      model: '',
      ...defaultOpenAICompatibleGenerationParams,
    });
  });

  test('returns sanitized settings and forwards validated saves', async () => {
    const service: ProviderSettingsService = {
      getSettings: async () => settingsView,
      saveSettings: vi.fn(async () => settingsView),
      resolveChatProvider: vi.fn(),
    };
    const handlers = registerTestHandlers(service);
    const event = createTrustedEvent();

    await expect(handlers.get('provider:get-settings')!(event)).resolves.toEqual(settingsView);
    await expect(
      handlers.get('provider:save-settings')!(event, {
        activeProvider: 'openai-compatible',
        baseUrl: ' https://provider.example/v1 ',
        model: ' roleplay-model ',
        apiKey: ' test-key ',
        temperature: 0.7,
        maxOutputTokens: 2048,
        requestTimeoutMs: 60_000,
      }),
    ).resolves.toEqual(settingsView);
    expect(service.saveSettings).toHaveBeenCalledWith({
      activeProvider: 'openai-compatible',
      baseUrl: 'https://provider.example/v1',
      model: 'roleplay-model',
      apiKey: 'test-key',
      clearApiKey: false,
      temperature: 0.7,
      maxOutputTokens: 2048,
      requestTimeoutMs: 60_000,
    });
    expect(JSON.stringify(settingsView)).not.toContain('test-key');
  });

  test('rejects calls from a non-main frame before invoking the service', async () => {
    const service: ProviderSettingsService = {
      getSettings: vi.fn(),
      saveSettings: vi.fn(),
      resolveChatProvider: vi.fn(),
    };
    const handlers = registerTestHandlers(service);
    const event = createTrustedEvent();
    event.senderFrame = {};

    await expect(handlers.get('provider:get-settings')!(event)).rejects.toThrow(
      'Rejected provider settings IPC call from an untrusted frame',
    );
    expect(service.getSettings).not.toHaveBeenCalled();
  });

  test('maps expected service errors without exposing internal details', async () => {
    const service: ProviderSettingsService = {
      getSettings: async () => settingsView,
      saveSettings: async () => {
        throw new ProviderSettingsError('secret-storage-unavailable', 'internal storage detail');
      },
      resolveChatProvider: vi.fn(),
    };
    const handlers = registerTestHandlers(service);

    await expect(
      handlers.get('provider:save-settings')!(createTrustedEvent(), {
        activeProvider: 'openai-compatible',
        baseUrl: 'https://provider.example/v1',
        model: 'roleplay-model',
        apiKey: 'test-key',
      }),
    ).rejects.toThrow('系统安全存储不可用，无法保存 API Key。');
  });
});

type Registrar = Parameters<typeof registerProviderSettingsIpc>[0];
type RegisteredHandler = Parameters<Registrar['handle']>[1];
type HandlerEvent = Parameters<RegisteredHandler>[0];

function registerTestHandlers(service: ProviderSettingsService): Map<string, RegisteredHandler> {
  const handlers = new Map<string, RegisteredHandler>();
  registerProviderSettingsIpc(
    {
      handle: (channel, listener) => handlers.set(channel, listener),
    },
    service,
  );
  return handlers;
}

function createTrustedEvent(): HandlerEvent {
  const mainFrame = {};
  return {
    senderFrame: mainFrame,
    sender: { mainFrame },
  };
}
