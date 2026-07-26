import { and, eq } from 'drizzle-orm';
import type { XiongDatabase } from './database';
import { providerConfigs, providerSecrets, type ProviderConfigRecord } from './schema';

export const defaultOpenAICompatibleProviderId = 'openai-compatible-default';
export const defaultOpenAICompatibleSecretId = 'openai-compatible-default-api-key';

export type ActiveProviderType = 'mock' | 'openai-compatible';

export interface SaveOpenAICompatibleConfigInput {
  baseUrl: string;
  defaultModel: string;
  encryptedApiKey?: string | null;
  params?: Record<string, unknown>;
  activate: boolean;
}

export interface RotateEncryptedSecretIfUnchangedInput {
  apiKeyRef: string;
  expectedEncryptedValue: string;
  encryptedValue: string;
}

export interface ProviderConfigRepository {
  getActiveProviderType(): ActiveProviderType;
  getOpenAICompatibleConfig(): ProviderConfigRecord | undefined;
  getEncryptedSecret(id: string): string | undefined;
  saveOpenAICompatibleConfig(input: SaveOpenAICompatibleConfigInput): ProviderConfigRecord;
  rotateEncryptedSecretIfUnchanged(input: RotateEncryptedSecretIfUnchangedInput): boolean;
  setActiveProvider(type: ActiveProviderType): void;
}

export function createProviderConfigRepository(database: XiongDatabase): ProviderConfigRepository {
  return {
    getActiveProviderType: () => {
      const active = database.db
        .select({ type: providerConfigs.type })
        .from(providerConfigs)
        .where(eq(providerConfigs.isActive, true))
        .get();
      return active?.type ?? 'mock';
    },

    getOpenAICompatibleConfig: () =>
      database.db
        .select()
        .from(providerConfigs)
        .where(eq(providerConfigs.id, defaultOpenAICompatibleProviderId))
        .get(),

    getEncryptedSecret: (id) =>
      database.db
        .select({ encryptedValue: providerSecrets.encryptedValue })
        .from(providerSecrets)
        .where(eq(providerSecrets.id, id))
        .get()?.encryptedValue,

    saveOpenAICompatibleConfig: (input) =>
      database.db.transaction((transaction) => {
        const existing = transaction
          .select()
          .from(providerConfigs)
          .where(eq(providerConfigs.id, defaultOpenAICompatibleProviderId))
          .get();
        const now = Date.now();
        let apiKeyRef = existing?.apiKeyRef ?? null;
        let secretToDelete: string | null = null;

        if (typeof input.encryptedApiKey === 'string') {
          if (apiKeyRef && apiKeyRef !== defaultOpenAICompatibleSecretId) {
            secretToDelete = apiKeyRef;
          }
          apiKeyRef = defaultOpenAICompatibleSecretId;
          transaction
            .insert(providerSecrets)
            .values({
              id: apiKeyRef,
              encryptedValue: input.encryptedApiKey,
              createdAt: now,
              updatedAt: now,
            })
            .onConflictDoUpdate({
              target: providerSecrets.id,
              set: {
                encryptedValue: input.encryptedApiKey,
                updatedAt: now,
              },
            })
            .run();
        } else if (input.encryptedApiKey === null) {
          secretToDelete = apiKeyRef;
          apiKeyRef = null;
        }

        if (input.activate) {
          transaction.update(providerConfigs).set({ isActive: false }).run();
        }

        transaction
          .insert(providerConfigs)
          .values({
            id: defaultOpenAICompatibleProviderId,
            type: 'openai-compatible',
            name: 'OpenAI Compatible',
            baseUrl: input.baseUrl,
            apiKeyRef,
            defaultModel: input.defaultModel,
            params: input.params ?? existing?.params ?? {},
            isActive: input.activate,
            createdAt: existing?.createdAt ?? now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: providerConfigs.id,
            set: {
              baseUrl: input.baseUrl,
              apiKeyRef,
              defaultModel: input.defaultModel,
              ...(input.params === undefined ? {} : { params: input.params }),
              isActive: input.activate,
              updatedAt: now,
            },
          })
          .run();

        if (secretToDelete) {
          transaction.delete(providerSecrets).where(eq(providerSecrets.id, secretToDelete)).run();
        }

        return transaction
          .select()
          .from(providerConfigs)
          .where(eq(providerConfigs.id, defaultOpenAICompatibleProviderId))
          .get()!;
      }),

    rotateEncryptedSecretIfUnchanged: (input) =>
      database.db.transaction((transaction) => {
        const currentConfig = transaction
          .select({ apiKeyRef: providerConfigs.apiKeyRef })
          .from(providerConfigs)
          .where(eq(providerConfigs.id, defaultOpenAICompatibleProviderId))
          .get();
        if (currentConfig?.apiKeyRef !== input.apiKeyRef) {
          return false;
        }

        const result = transaction
          .update(providerSecrets)
          .set({ encryptedValue: input.encryptedValue, updatedAt: Date.now() })
          .where(
            and(
              eq(providerSecrets.id, input.apiKeyRef),
              eq(providerSecrets.encryptedValue, input.expectedEncryptedValue),
            ),
          )
          .run();
        return result.changes === 1;
      }),

    setActiveProvider: (type) => {
      database.db.update(providerConfigs).set({ isActive: false }).run();
      if (type === 'openai-compatible') {
        const result = database.db
          .update(providerConfigs)
          .set({ isActive: true, updatedAt: Date.now() })
          .where(eq(providerConfigs.id, defaultOpenAICompatibleProviderId))
          .run();
        if (result.changes === 0) {
          throw new Error('OpenAI Compatible provider is not configured');
        }
      }
    },
  };
}
