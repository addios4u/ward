import { describe, it, expect } from 'vitest';
import { generateApiKey } from '../../src/lib/apiKey.js';

describe('generateApiKey', () => {
  it('ward_ 접두사로 시작해야 한다', () => {
    const key = generateApiKey();
    expect(key.startsWith('ward_')).toBe(true);
  });

  it('ward_ 이후 64자리 hex 문자열이어야 한다', () => {
    const key = generateApiKey();
    const hex = key.slice(5);
    expect(hex).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
  });

  it('호출마다 고유한 키를 생성해야 한다', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(keys.size).toBe(100);
  });
});
