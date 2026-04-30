import { describe, expect, it } from '@jest/globals';

import en from '../locales/en/common.json';
import zhCN from '../locales/zh-CN/common.json';

/**
 * Recursively collect every leaf key path (e.g. "common.cancel",
 * "sidebar.clearAlert.body_other") from a nested JSON object.
 */
function collectKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, val]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      return collectKeys(val as Record<string, unknown>, path);
    }
    return [path];
  });
}

describe('locale key parity', () => {
  const enKeys = new Set(collectKeys(en as Record<string, unknown>));
  const zhKeys = new Set(collectKeys(zhCN as Record<string, unknown>));

  it('zh-CN has every key that en has', () => {
    const missing = [...enKeys].filter((k) => !zhKeys.has(k));
    expect(missing).toEqual([]);
  });

  it('en has every key that zh-CN has (no orphaned zh-CN keys)', () => {
    const extra = [...zhKeys].filter((k) => !enKeys.has(k));
    expect(extra).toEqual([]);
  });
});
