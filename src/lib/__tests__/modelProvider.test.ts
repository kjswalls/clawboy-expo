import { describe, it, expect } from '@jest/globals';
import {
  normalizeProvider,
  groupModelsByProvider,
  PROVIDER_ORDER,
  type ProviderSlug,
} from '../modelProvider';
import type { Model } from '@/types';

function makeModel(id: string, overrides: Partial<Model> = {}): Model {
  return { id, name: id, provider: undefined, ...overrides } as unknown as Model;
}

describe('normalizeProvider — providerKeys', () => {
  it('matches openai by provider field', () => {
    expect(normalizeProvider(makeModel('m', { provider: 'openai' })).slug).toBe('openai');
  });

  it('matches anthropic by provider field', () => {
    expect(normalizeProvider(makeModel('m', { provider: 'anthropic' })).slug).toBe('anthropic');
  });

  it('matches google by provider field', () => {
    expect(normalizeProvider(makeModel('m', { provider: 'google' })).slug).toBe('google');
  });

  it('matches google by vertex provider field', () => {
    expect(normalizeProvider(makeModel('m', { provider: 'vertex' })).slug).toBe('google');
  });

  it('matches google by googleapis provider field', () => {
    expect(normalizeProvider(makeModel('m', { provider: 'googleapis' })).slug).toBe('google');
  });

  it('matches deepseek by provider field', () => {
    expect(normalizeProvider(makeModel('m', { provider: 'deepseek' })).slug).toBe('deepseek');
  });

  it('matches moonshot by provider field', () => {
    expect(normalizeProvider(makeModel('m', { provider: 'moonshot' })).slug).toBe('moonshot');
  });

  it('matches kimi (moonshot alias) by provider field', () => {
    expect(normalizeProvider(makeModel('m', { provider: 'kimi' })).slug).toBe('moonshot');
  });
});

describe('normalizeProvider — nameKeys (no provider)', () => {
  it('matches gpt- prefix by model id', () => {
    expect(normalizeProvider(makeModel('gpt-4o')).slug).toBe('openai');
  });

  it('matches o1- prefix by model id', () => {
    expect(normalizeProvider(makeModel('o1-preview')).slug).toBe('openai');
  });

  it('matches o3- prefix by model id', () => {
    expect(normalizeProvider(makeModel('o3-mini')).slug).toBe('openai');
  });

  it('matches o4- prefix by model id', () => {
    expect(normalizeProvider(makeModel('o4-mini')).slug).toBe('openai');
  });

  it('matches chatgpt by model id', () => {
    expect(normalizeProvider(makeModel('chatgpt-latest')).slug).toBe('openai');
  });

  it('matches moonshot-kimi by moonshot nameKey (kimi)', () => {
    // agents-005: moonshot/kimi models should be correctly classified
    const result = normalizeProvider(makeModel('kimi-moonshot-v1'));
    expect(result.slug).toBe('moonshot');
  });

  it('matches claude by model id', () => {
    expect(normalizeProvider(makeModel('claude-3-5-sonnet')).slug).toBe('anthropic');
  });

  it('matches gemini by model id', () => {
    expect(normalizeProvider(makeModel('gemini-pro')).slug).toBe('google');
  });

  it('matches llama by model id', () => {
    expect(normalizeProvider(makeModel('llama-3-70b')).slug).toBe('meta');
  });

  it('matches deepseek by model id', () => {
    expect(normalizeProvider(makeModel('deepseek-r1')).slug).toBe('deepseek');
  });

  it('matches grok by model id', () => {
    expect(normalizeProvider(makeModel('grok-2')).slug).toBe('xai');
  });
});

describe('normalizeProvider — unknown model', () => {
  it('returns other for completely unknown model', () => {
    expect(normalizeProvider(makeModel('totally-unknown-xyz-9000')).slug).toBe('other');
  });

  it('returns capitalised provider label when provider field is set but unrecognised', () => {
    const result = normalizeProvider(makeModel('m', { provider: 'acme' }));
    expect(result.slug).toBe('other');
    expect(result.label).toBe('Acme');
  });

  it('returns "Other" label when no provider and no name match', () => {
    const result = normalizeProvider(makeModel('something-unknown'));
    expect(result.label).toBe('Other');
  });
});

describe('PROVIDER_ORDER', () => {
  it('starts with openai', () => {
    expect(PROVIDER_ORDER[0]).toBe('openai');
  });

  it('ends with other', () => {
    expect(PROVIDER_ORDER[PROVIDER_ORDER.length - 1]).toBe('other');
  });

  it('contains all expected slugs', () => {
    const expected: ProviderSlug[] = ['openai', 'anthropic', 'google', 'meta', 'deepseek', 'mistral', 'xai', 'cohere', 'perplexity', 'moonshot', 'other'];
    expect(PROVIDER_ORDER).toEqual(expected);
  });
});

describe('groupModelsByProvider', () => {
  it('groups models by provider and returns in PROVIDER_ORDER order', () => {
    const models: Model[] = [
      makeModel('gemini-pro'),
      makeModel('gpt-4o'),
      makeModel('claude-3'),
    ];
    const groups = groupModelsByProvider(models);
    const slugs = groups.map((g) => g.slug);
    // openai before google before anthropic per PROVIDER_ORDER
    expect(slugs.indexOf('openai')).toBeLessThan(slugs.indexOf('google'));
    expect(slugs.indexOf('anthropic')).toBeGreaterThan(slugs.indexOf('openai'));
  });

  it('excludes providers with no models', () => {
    const models: Model[] = [makeModel('gpt-4o')];
    const groups = groupModelsByProvider(models);
    expect(groups).toHaveLength(1);
    expect(groups[0].slug).toBe('openai');
  });

  it('puts unknown models under "other"', () => {
    const models: Model[] = [makeModel('mystery-model-xyz')];
    const groups = groupModelsByProvider(models);
    expect(groups[0].slug).toBe('other');
  });
});
