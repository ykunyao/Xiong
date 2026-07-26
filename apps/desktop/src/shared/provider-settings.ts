export type ActiveProvider = 'mock' | 'openai-compatible';

export type SecretStorageStatus = 'available' | 'unavailable' | 'insecure';

export interface OpenAICompatibleGenerationParams {
  temperature: number;
  maxOutputTokens: number;
  requestTimeoutMs: number;
}

export const openAICompatibleGenerationParamLimits = Object.freeze({
  temperature: Object.freeze({ min: 0, max: 2 }),
  maxOutputTokens: Object.freeze({ min: 1, max: 32_768 }),
  requestTimeoutMs: Object.freeze({ min: 1_000, max: 600_000 }),
});

export const defaultOpenAICompatibleGenerationParams: Readonly<OpenAICompatibleGenerationParams> =
  Object.freeze({
    temperature: 1,
    maxOutputTokens: 2_048,
    requestTimeoutMs: 60_000,
  });

export interface OpenAICompatibleSettingsView extends OpenAICompatibleGenerationParams {
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
}

export interface ProviderSettingsView {
  activeProvider: ActiveProvider;
  openAICompatible: OpenAICompatibleSettingsView;
  secretStorageStatus: SecretStorageStatus;
}

export interface SaveProviderSettingsInput {
  activeProvider: ActiveProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
  requestTimeoutMs?: number;
}
