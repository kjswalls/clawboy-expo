import type { Model } from '@/types';

export type ProviderSlug =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'meta'
  | 'deepseek'
  | 'mistral'
  | 'xai'
  | 'cohere'
  | 'perplexity'
  | 'moonshot'
  | 'other';

export interface ProviderInfo {
  slug: ProviderSlug;
  label: string;
  color: string;
}

export interface ModelGroup {
  slug: ProviderSlug;
  label: string;
  color: string;
  items: Model[];
}

const PROVIDER_MAP: Array<{
  slug: ProviderSlug;
  label: string;
  color: string;
  /** Strings to match against model.provider (lowercased) */
  providerKeys: string[];
  /** Strings to match against model.id or model.name (lowercased) when provider field is absent */
  nameKeys: string[];
}> = [
  { slug: 'openai',      label: 'OpenAI',      color: '#10A37F', providerKeys: ['openai'],                        nameKeys: ['gpt', 'o1', 'o3', 'o4', 'chatgpt'] },
  { slug: 'anthropic',   label: 'Anthropic',   color: '#D97706', providerKeys: ['anthropic'],                     nameKeys: ['claude'] },
  { slug: 'google',      label: 'Google',      color: '#4285F4', providerKeys: ['google', 'vertex'],              nameKeys: ['gemini', 'palm', 'bard'] },
  { slug: 'meta',        label: 'Meta',        color: '#1877F2', providerKeys: ['meta'],                          nameKeys: ['llama'] },
  { slug: 'deepseek',    label: 'DeepSeek',    color: '#6366F1', providerKeys: ['deepseek'],                      nameKeys: ['deepseek'] },
  { slug: 'mistral',     label: 'Mistral',     color: '#F97316', providerKeys: ['mistral'],                       nameKeys: ['mistral', 'mixtral'] },
  { slug: 'xai',         label: 'xAI',         color: '#AAAAAA', providerKeys: ['xai', 'x.ai'],                  nameKeys: ['grok'] },
  { slug: 'cohere',      label: 'Cohere',      color: '#39594D', providerKeys: ['cohere'],                        nameKeys: ['command', 'coral'] },
  { slug: 'perplexity',  label: 'Perplexity',  color: '#1FB8CD', providerKeys: ['perplexity'],                    nameKeys: ['sonar', 'pplx'] },
  { slug: 'moonshot',    label: 'Moonshot',    color: '#1AECB8', providerKeys: ['moonshot', 'kimi'],              nameKeys: ['moonshot', 'kimi'] },
];

/** Stable display order for provider sections. 'other' always last. */
export const PROVIDER_ORDER: ProviderSlug[] = [
  'openai',
  'anthropic',
  'google',
  'meta',
  'deepseek',
  'mistral',
  'xai',
  'cohere',
  'perplexity',
  'moonshot',
  'other',
];

export function normalizeProvider(model: Model): ProviderInfo {
  const providerRaw = (model.provider ?? '').toLowerCase();
  const idRaw = model.id.toLowerCase();
  const nameRaw = (model.name ?? '').toLowerCase();

  for (const entry of PROVIDER_MAP) {
    if (providerRaw && entry.providerKeys.some((k) => providerRaw.includes(k))) {
      return { slug: entry.slug, label: entry.label, color: entry.color };
    }
  }

  for (const entry of PROVIDER_MAP) {
    if (
      entry.nameKeys.some((k) => idRaw.includes(k) || nameRaw.includes(k))
    ) {
      return { slug: entry.slug, label: entry.label, color: entry.color };
    }
  }

  const unknownLabel = model.provider
    ? model.provider.charAt(0).toUpperCase() + model.provider.slice(1)
    : 'Other';
  return { slug: 'other', label: unknownLabel, color: '#F59E0B' };
}

export function groupModelsByProvider(models: Model[]): ModelGroup[] {
  const map = new Map<ProviderSlug, ModelGroup>();

  for (const model of models) {
    const info = normalizeProvider(model);
    let group = map.get(info.slug);
    if (!group) {
      group = { slug: info.slug, label: info.label, color: info.color, items: [] };
      map.set(info.slug, group);
    }
    group.items.push(model);
  }

  return PROVIDER_ORDER.filter((slug) => map.has(slug)).map((slug) => map.get(slug)!);
}
