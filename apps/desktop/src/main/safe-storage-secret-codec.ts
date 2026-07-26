import type { SecretStorageStatus } from '../shared/provider-settings';
import { ProviderSettingsError, type ProviderSecretCodec } from './provider-settings-service';

export interface SafeStorageLike {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  getSelectedStorageBackend(): string;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<{
    result: string;
    shouldReEncrypt: boolean;
  }>;
}

export function createSafeStorageSecretCodec(
  safeStorage: SafeStorageLike,
  platform: NodeJS.Platform = process.platform,
): ProviderSecretCodec {
  async function getStatus(): Promise<SecretStorageStatus> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      return 'unavailable';
    }

    if (platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') {
      return 'insecure';
    }

    return 'available';
  }

  async function assertAvailable(): Promise<void> {
    const status = await getStatus();
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
  }

  return {
    getStatus,

    async encrypt(value) {
      await assertAvailable();
      const encrypted = await safeStorage.encryptStringAsync(value);
      return encrypted.toString('base64');
    },

    async decrypt(encryptedValue) {
      await assertAvailable();
      const decrypted = await safeStorage.decryptStringAsync(Buffer.from(encryptedValue, 'base64'));
      if (!decrypted.shouldReEncrypt) {
        return { value: decrypted.result };
      }

      const reencrypted = await safeStorage.encryptStringAsync(decrypted.result);
      return {
        value: decrypted.result,
        reencryptedValue: reencrypted.toString('base64'),
      };
    },
  };
}
