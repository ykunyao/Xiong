import { describe, expect, test } from 'vitest';
import {
  buildProviderSettingsSaveInput,
  formatProviderGenerationParams,
  parseProviderGenerationParams,
} from './provider-settings-form';

describe('provider generation settings form', () => {
  test('builds a Mock save without parsing or submitting disabled generation fields', () => {
    expect(
      buildProviderSettingsSaveInput({
        activeProvider: 'mock',
        baseUrl: '',
        model: '',
        apiKey: 'must-not-submit',
        clearApiKey: true,
        temperature: 'not-a-number',
        maxOutputTokens: '-1',
        requestTimeoutSeconds: 'never',
      }),
    ).toEqual({
      success: true,
      value: {
        activeProvider: 'mock',
        baseUrl: '',
        model: '',
      },
    });
  });

  test('formats internal milliseconds as seconds and parses edited values', () => {
    expect(
      formatProviderGenerationParams({
        temperature: 0.8,
        maxOutputTokens: 2048,
        requestTimeoutMs: 60_000,
      }),
    ).toEqual({
      temperature: '0.8',
      maxOutputTokens: '2048',
      requestTimeoutSeconds: '60',
    });

    expect(
      parseProviderGenerationParams({
        temperature: ' 0.65 ',
        maxOutputTokens: '4096',
        requestTimeoutSeconds: '90',
      }),
    ).toEqual({
      success: true,
      value: {
        temperature: 0.65,
        maxOutputTokens: 4096,
        requestTimeoutMs: 90_000,
      },
    });
  });

  test.each([
    [
      { temperature: '2.1', maxOutputTokens: '2048', requestTimeoutSeconds: '60' },
      '温度必须在 0 到 2 之间。',
    ],
    [
      { temperature: '1', maxOutputTokens: '0', requestTimeoutSeconds: '60' },
      '最大输出 Token 必须是 1 到 32768 之间的整数。',
    ],
    [
      { temperature: '1', maxOutputTokens: '2048', requestTimeoutSeconds: '1.5' },
      '请求超时必须是 1 到 600 之间的整数秒。',
    ],
  ])('returns a clear message for invalid UI values', (input, message) => {
    expect(parseProviderGenerationParams(input)).toEqual({ success: false, message });
  });
});
