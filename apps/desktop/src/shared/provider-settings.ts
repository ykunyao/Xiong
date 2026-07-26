export type ActiveProvider = 'mock' | 'openai-compatible';

export type SecretStorageStatus = 'available' | 'unavailable' | 'insecure';

export interface OpenAICompatibleSettingsView {
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
}
