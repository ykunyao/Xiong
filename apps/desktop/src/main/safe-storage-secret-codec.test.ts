import { describe, expect, test } from 'vitest';
import { createSafeStorageSecretCodec } from './safe-storage-secret-codec';

describe('createSafeStorageSecretCodec', () => {
  test('encrypts and decrypts base64 values with asynchronous safeStorage', async () => {
    const codec = createSafeStorageSecretCodec(
      {
        isAsyncEncryptionAvailable: async () => true,
        getSelectedStorageBackend: () => 'unknown',
        encryptStringAsync: async (value) => Buffer.from(`cipher:${value}`),
        decryptStringAsync: async (value) => ({
          result: value.toString().replace(/^cipher:/, ''),
          shouldReEncrypt: false,
        }),
      },
      'win32',
    );

    await expect(codec.getStatus()).resolves.toBe('available');
    const encrypted = await codec.encrypt('plain-secret');
    expect(encrypted).toBe(Buffer.from('cipher:plain-secret').toString('base64'));
    await expect(codec.decrypt(encrypted)).resolves.toEqual({ value: 'plain-secret' });
  });

  test('reports unavailable and insecure backends', async () => {
    const unavailable = createSafeStorageSecretCodec(
      createSafeStorage({ available: false }),
      'win32',
    );
    const insecure = createSafeStorageSecretCodec(
      createSafeStorage({ available: true, backend: 'basic_text' }),
      'linux',
    );

    await expect(unavailable.getStatus()).resolves.toBe('unavailable');
    await expect(insecure.getStatus()).resolves.toBe('insecure');
    await expect(unavailable.encrypt('plain-secret')).rejects.toThrow(
      'Secure secret storage is unavailable',
    );
    await expect(insecure.encrypt('plain-secret')).rejects.toThrow(
      'The selected secret storage backend is insecure',
    );
  });

  test('returns a replacement encrypted value after key rotation', async () => {
    const codec = createSafeStorageSecretCodec(
      {
        isAsyncEncryptionAvailable: async () => true,
        getSelectedStorageBackend: () => 'unknown',
        encryptStringAsync: async (value) => Buffer.from(`rotated:${value}`),
        decryptStringAsync: async () => ({
          result: 'plain-secret',
          shouldReEncrypt: true,
        }),
      },
      'win32',
    );

    await expect(codec.decrypt(Buffer.from('old-cipher').toString('base64'))).resolves.toEqual({
      value: 'plain-secret',
      reencryptedValue: Buffer.from('rotated:plain-secret').toString('base64'),
    });
  });
});

function createSafeStorage(options: { available: boolean; backend?: 'basic_text' | 'unknown' }) {
  return {
    isAsyncEncryptionAvailable: async () => options.available,
    getSelectedStorageBackend: () => options.backend ?? 'unknown',
    encryptStringAsync: async (value: string) => Buffer.from(value),
    decryptStringAsync: async (value: Buffer) => ({
      result: value.toString(),
      shouldReEncrypt: false,
    }),
  };
}
