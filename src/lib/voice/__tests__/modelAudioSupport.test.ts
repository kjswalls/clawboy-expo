import { modelSupportsAudioInput } from '../modelAudioSupport';
import type { Model } from '@/types';

function model(overrides: Partial<Model> & { id: string }): Model {
  return { id: overrides.id, ...overrides };
}

describe('modelSupportsAudioInput', () => {
  describe('explicit model.input array (gateway-authoritative)', () => {
    it('returns true when input includes "audio"', () => {
      expect(modelSupportsAudioInput(model({ id: 'anything', input: ['text', 'audio'] }))).toBe(true);
    });

    it('returns false when input exists but does not include "audio"', () => {
      expect(modelSupportsAudioInput(model({ id: 'gpt-4o', input: ['text', 'image'] }))).toBe(false);
    });

    it('falls through to heuristic when input is an empty array', () => {
      // empty array → heuristic; gpt-4o prefix → true
      expect(modelSupportsAudioInput(model({ id: 'gpt-4o', input: [] }))).toBe(true);
    });
  });

  describe('heuristic id-prefix fallback (no input array)', () => {
    it('returns true for gpt-4o', () => {
      expect(modelSupportsAudioInput(model({ id: 'gpt-4o' }))).toBe(true);
    });

    it('returns true for gpt-4o-mini-audio-preview', () => {
      expect(modelSupportsAudioInput(model({ id: 'gpt-4o-mini-audio-preview' }))).toBe(true);
    });

    it('returns true for gpt-4o-audio-preview', () => {
      expect(modelSupportsAudioInput(model({ id: 'gpt-4o-audio-preview' }))).toBe(true);
    });

    it('returns true for gpt-4o-2024-12-17', () => {
      expect(modelSupportsAudioInput(model({ id: 'gpt-4o-2024-12-17' }))).toBe(true);
    });

    it('returns true for gemini-1.5-pro', () => {
      expect(modelSupportsAudioInput(model({ id: 'gemini-1.5-pro' }))).toBe(true);
    });

    it('returns true for gemini-2.0-flash', () => {
      expect(modelSupportsAudioInput(model({ id: 'gemini-2.0-flash' }))).toBe(true);
    });

    it('returns true for gemini-2.5-pro', () => {
      expect(modelSupportsAudioInput(model({ id: 'gemini-2.5-pro' }))).toBe(true);
    });

    it('returns false for claude-3-7-sonnet', () => {
      expect(modelSupportsAudioInput(model({ id: 'claude-3-7-sonnet-20250219' }))).toBe(false);
    });

    it('returns false for claude-opus-4', () => {
      expect(modelSupportsAudioInput(model({ id: 'claude-opus-4-5' }))).toBe(false);
    });

    it('returns false for deepseek-r1', () => {
      expect(modelSupportsAudioInput(model({ id: 'deepseek-r1' }))).toBe(false);
    });

    it('returns false for llama-3.1-70b', () => {
      expect(modelSupportsAudioInput(model({ id: 'llama-3.1-70b' }))).toBe(false);
    });

    it('returns false for an unknown model id', () => {
      expect(modelSupportsAudioInput(model({ id: 'my-custom-local-model' }))).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('returns false for null', () => {
      expect(modelSupportsAudioInput(null)).toBe(false);
    });

    it('returns false for undefined', () => {
      expect(modelSupportsAudioInput(undefined)).toBe(false);
    });

    it('is case-insensitive on model id', () => {
      expect(modelSupportsAudioInput(model({ id: 'GPT-4O' }))).toBe(true);
      expect(modelSupportsAudioInput(model({ id: 'Gemini-2.0-Flash' }))).toBe(true);
    });
  });
});
