import type {
  ActiveProvider,
  OpenAICompatibleGenerationParams,
  SaveProviderSettingsInput,
} from '../../shared/provider-settings';
import { openAICompatibleGenerationParamLimits } from '../../shared/provider-settings';

export interface ProviderGenerationFormState {
  temperature: string;
  maxOutputTokens: string;
  requestTimeoutSeconds: string;
}

export interface ProviderSettingsFormState extends ProviderGenerationFormState {
  activeProvider: ActiveProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  clearApiKey: boolean;
}

export type ParsedProviderGenerationParams =
  | { success: true; value: OpenAICompatibleGenerationParams }
  | { success: false; message: string };

export type BuiltProviderSettingsSaveInput =
  | { success: true; value: SaveProviderSettingsInput }
  | { success: false; message: string };

export function buildProviderSettingsSaveInput(
  form: ProviderSettingsFormState,
): BuiltProviderSettingsSaveInput {
  const providerFields = {
    activeProvider: form.activeProvider,
    baseUrl: form.baseUrl,
    model: form.model,
  };
  if (form.activeProvider === 'mock') {
    return { success: true, value: providerFields };
  }

  const generationParams = parseProviderGenerationParams(form);
  if (!generationParams.success) {
    return generationParams;
  }

  const apiKey = form.apiKey.trim();
  return {
    success: true,
    value: {
      ...providerFields,
      ...generationParams.value,
      ...(apiKey ? { apiKey } : {}),
      ...(form.clearApiKey ? { clearApiKey: true } : {}),
    },
  };
}

export function formatProviderGenerationParams(
  params: OpenAICompatibleGenerationParams,
): ProviderGenerationFormState {
  return {
    temperature: String(params.temperature),
    maxOutputTokens: String(params.maxOutputTokens),
    requestTimeoutSeconds: String(params.requestTimeoutMs / 1_000),
  };
}

export function parseProviderGenerationParams(
  form: ProviderGenerationFormState,
): ParsedProviderGenerationParams {
  const temperature = parseRequiredNumber(form.temperature);
  const temperatureLimits = openAICompatibleGenerationParamLimits.temperature;
  if (
    temperature === undefined ||
    temperature < temperatureLimits.min ||
    temperature > temperatureLimits.max
  ) {
    return { success: false, message: '温度必须在 0 到 2 之间。' };
  }

  const maxOutputTokens = parseRequiredNumber(form.maxOutputTokens);
  const outputLimits = openAICompatibleGenerationParamLimits.maxOutputTokens;
  if (
    maxOutputTokens === undefined ||
    !Number.isInteger(maxOutputTokens) ||
    maxOutputTokens < outputLimits.min ||
    maxOutputTokens > outputLimits.max
  ) {
    return { success: false, message: '最大输出 Token 必须是 1 到 32768 之间的整数。' };
  }

  const requestTimeoutSeconds = parseRequiredNumber(form.requestTimeoutSeconds);
  const timeoutMinSeconds = openAICompatibleGenerationParamLimits.requestTimeoutMs.min / 1_000;
  const timeoutMaxSeconds = openAICompatibleGenerationParamLimits.requestTimeoutMs.max / 1_000;
  if (
    requestTimeoutSeconds === undefined ||
    !Number.isInteger(requestTimeoutSeconds) ||
    requestTimeoutSeconds < timeoutMinSeconds ||
    requestTimeoutSeconds > timeoutMaxSeconds
  ) {
    return { success: false, message: '请求超时必须是 1 到 600 之间的整数秒。' };
  }

  return {
    success: true,
    value: {
      temperature,
      maxOutputTokens,
      requestTimeoutMs: requestTimeoutSeconds * 1_000,
    },
  };
}

function parseRequiredNumber(value: string): number | undefined {
  if (!value.trim()) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
