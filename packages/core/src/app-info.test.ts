import { describe, expect, it } from 'vitest';
import { createAppInfo } from './app-info';

describe('createAppInfo', () => {
  it('creates immutable Xiong application metadata', () => {
    expect(createAppInfo('0.1.0')).toEqual({
      name: 'Xiong',
      version: '0.1.0',
    });
  });
});
