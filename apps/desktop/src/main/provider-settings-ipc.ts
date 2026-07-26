import { z } from 'zod';
import {
  defaultOpenAICompatibleGenerationParams,
  openAICompatibleGenerationParamLimits,
  type SaveProviderSettingsInput,
} from '../shared/provider-settings';
import { ProviderSettingsError, type ProviderSettingsService } from './provider-settings-service';

interface ProviderSettingsIpcEvent {
  senderFrame: unknown;
  sender: {
    mainFrame: unknown;
  };
}

interface ProviderSettingsIpcRegistrar {
  handle(
    channel: string,
    listener: (event: ProviderSettingsIpcEvent, input?: unknown) => unknown,
  ): void;
}

const temperatureSchema = z
  .number()
  .refine(
    (value) =>
      Number.isFinite(value) &&
      value >= openAICompatibleGenerationParamLimits.temperature.min &&
      value <= openAICompatibleGenerationParamLimits.temperature.max,
    'Temperature must be between 0 and 2',
  )
  .default(defaultOpenAICompatibleGenerationParams.temperature);
const maxOutputTokensSchema = z
  .number()
  .refine(
    (value) =>
      Number.isInteger(value) &&
      value >= openAICompatibleGenerationParamLimits.maxOutputTokens.min &&
      value <= openAICompatibleGenerationParamLimits.maxOutputTokens.max,
    'Maximum output tokens must be an integer between 1 and 32768',
  )
  .default(defaultOpenAICompatibleGenerationParams.maxOutputTokens);
const requestTimeoutMsSchema = z
  .number()
  .refine(
    (value) =>
      Number.isInteger(value) &&
      value >= openAICompatibleGenerationParamLimits.requestTimeoutMs.min &&
      value <= openAICompatibleGenerationParamLimits.requestTimeoutMs.max &&
      value % 1_000 === 0,
    'Request timeout must be whole seconds between 1 and 600',
  )
  .default(defaultOpenAICompatibleGenerationParams.requestTimeoutMs);

const saveProviderSettingsSchema = z
  .object({
    activeProvider: z.enum(['mock', 'openai-compatible']),
    baseUrl: z.string().trim().max(2048, 'Provider base URL is too long'),
    model: z.string().trim().max(256, 'Model id is too long'),
    apiKey: z.string().trim().max(4096, 'API key is too long').optional(),
    clearApiKey: z.boolean().optional().default(false),
    temperature: temperatureSchema,
    maxOutputTokens: maxOutputTokensSchema,
    requestTimeoutMs: requestTimeoutMsSchema,
  })
  .superRefine((input, context) => {
    if (input.activeProvider === 'openai-compatible' && !input.baseUrl) {
      context.addIssue({
        code: 'custom',
        path: ['baseUrl'],
        message: 'Provider base URL is required',
      });
    }
    if (input.activeProvider === 'openai-compatible' && !input.model) {
      context.addIssue({
        code: 'custom',
        path: ['model'],
        message: 'Model id is required',
      });
    }
    if (input.clearApiKey && input.apiKey) {
      context.addIssue({
        code: 'custom',
        path: ['apiKey'],
        message: 'API key cannot be replaced and cleared at the same time',
      });
    }
  });

export function parseSaveProviderSettingsInput(input: unknown): SaveProviderSettingsInput {
  const result = saveProviderSettingsSchema.safeParse(input);
  if (result.success) {
    return {
      activeProvider: result.data.activeProvider,
      baseUrl: result.data.baseUrl,
      model: result.data.model,
      clearApiKey: result.data.clearApiKey,
      temperature: result.data.temperature,
      maxOutputTokens: result.data.maxOutputTokens,
      requestTimeoutMs: result.data.requestTimeoutMs,
      ...(result.data.apiKey === undefined ? {} : { apiKey: result.data.apiKey }),
    };
  }

  throw new Error(result.error.issues[0]?.message ?? 'Invalid provider settings');
}

export function registerProviderSettingsIpc(
  ipcMain: ProviderSettingsIpcRegistrar,
  service: ProviderSettingsService,
): void {
  ipcMain.handle('provider:get-settings', async (event) => {
    assertTrustedFrame(event);
    try {
      return await service.getSettings();
    } catch (error) {
      throw new Error(getUserFacingError(error), { cause: error });
    }
  });

  ipcMain.handle('provider:save-settings', async (event, input) => {
    assertTrustedFrame(event);
    const parsed = parseSaveProviderSettingsInput(input);
    try {
      return await service.saveSettings(parsed);
    } catch (error) {
      throw new Error(getUserFacingError(error), { cause: error });
    }
  });
}

function assertTrustedFrame(event: ProviderSettingsIpcEvent): void {
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Rejected provider settings IPC call from an untrusted frame');
  }
}

function getUserFacingError(error: unknown): string {
  if (!(error instanceof ProviderSettingsError)) {
    return 'Provider 设置操作失败，请重试。';
  }

  switch (error.code) {
    case 'invalid-base-url':
      return 'Provider 地址无效。远程地址必须使用 HTTPS，本地回环地址可以使用 HTTP。';
    case 'model-required':
      return '请输入模型 ID。';
    case 'temperature-out-of-range':
      return '温度必须在 0 到 2 之间。';
    case 'max-output-tokens-out-of-range':
      return '最大输出 Token 必须是 1 到 32768 之间的整数。';
    case 'request-timeout-out-of-range':
      return '请求超时必须是 1 到 600 之间的整数秒。';
    case 'secret-storage-unavailable':
      return '系统安全存储不可用，无法保存 API Key。';
    case 'secret-storage-insecure':
      return '当前系统密钥后端不安全，已拒绝保存 API Key。';
    case 'secret-decryption-failed':
      return '无法读取已保存的 API Key，请重新保存 Provider 设置。';
    case 'provider-not-configured':
      return 'OpenAI Compatible Provider 尚未配置。';
  }
}
