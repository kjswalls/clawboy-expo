/**
 * Unit tests for applyAudioCapabilityPolicy.
 *
 * Covers:
 * - Audio-capable model: all attachments pass through, no transcription.
 * - Text-only model: audio stripped, transcript inlined, non-audio preserved.
 * - Text-only model + no audio attachments: nothing changes.
 * - Transcription error + user proceeds: failed id tracked, send continues.
 * - Transcription error + user cancels: returns null (abort send).
 * - Multiple audio attachments: all transcribed and concatenated.
 */
import { applyAudioCapabilityPolicy } from '../applyAudioPolicy';
import { TranscriptionError } from '../transcribeAudio';
import type { InputAttachment } from '@/components/input/types';
import type { Model } from '@/types';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../transcribeAudio', () => ({
  transcribeAudioFile: jest.fn(),
  TranscriptionError: class TranscriptionError extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.name = 'TranscriptionError';
      this.code = code;
    }
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { transcribeAudioFile } = require('../transcribeAudio');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAttachment(overrides: Partial<InputAttachment> & { id: string; type: InputAttachment['type'] }): InputAttachment {
  return {
    name: `${overrides.type}-${overrides.id}`,
    uri: `file:///tmp/${overrides.id}.m4a`,
    preview: `file:///tmp/${overrides.id}.m4a`,
    ...overrides,
  };
}

function audioCapableModel(): Model {
  return { id: 'gpt-4o', name: 'GPT-4o' };
}

function textOnlyModel(): Model {
  return { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' };
}

const noop = async () => true;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe('applyAudioCapabilityPolicy', () => {
  describe('audio-capable model', () => {
    it('returns all attachments unchanged', async () => {
      const att = [
        makeAttachment({ id: '1', type: 'audio' }),
        makeAttachment({ id: '2', type: 'image' }),
      ];
      const result = await applyAudioCapabilityPolicy(att, audioCapableModel(), { onTranscriptionError: noop });
      expect(result).not.toBeNull();
      expect(result!.attachmentsForGateway).toEqual(att);
      expect(result!.voiceTranscript).toBeNull();
      expect(result!.failedAudioIds).toHaveLength(0);
    });

    it('does not call transcribeAudioFile', async () => {
      const att = [makeAttachment({ id: '1', type: 'audio' })];
      await applyAudioCapabilityPolicy(att, audioCapableModel(), { onTranscriptionError: noop });
      expect(transcribeAudioFile).not.toHaveBeenCalled();
    });
  });

  describe('text-only model', () => {
    it('strips audio from gateway attachments and returns transcript', async () => {
      transcribeAudioFile.mockResolvedValueOnce({ text: 'Hello world', durationMs: 1200 });
      const audioAtt = makeAttachment({ id: 'v1', type: 'audio' });
      const imageAtt = makeAttachment({ id: 'img1', type: 'image' });
      const att = [audioAtt, imageAtt];

      const result = await applyAudioCapabilityPolicy(att, textOnlyModel(), { onTranscriptionError: noop });

      expect(result).not.toBeNull();
      expect(result!.attachmentsForGateway).toEqual([imageAtt]);
      expect(result!.voiceTranscript).toBe('Hello world');
      expect(result!.failedAudioIds).toHaveLength(0);
    });

    it('concatenates multiple transcripts with double newline', async () => {
      transcribeAudioFile
        .mockResolvedValueOnce({ text: 'First part', durationMs: 800 })
        .mockResolvedValueOnce({ text: 'Second part', durationMs: 1100 });
      const att = [
        makeAttachment({ id: 'v1', type: 'audio' }),
        makeAttachment({ id: 'v2', type: 'audio' }),
      ];

      const result = await applyAudioCapabilityPolicy(att, textOnlyModel(), { onTranscriptionError: noop });

      expect(result!.voiceTranscript).toBe('First part\n\nSecond part');
      expect(result!.attachmentsForGateway).toHaveLength(0);
    });

    it('passes non-audio attachments through untouched', async () => {
      transcribeAudioFile.mockResolvedValueOnce({ text: 'hello', durationMs: 500 });
      const fileAtt = makeAttachment({ id: 'f1', type: 'file' });
      const videoAtt = makeAttachment({ id: 'vid1', type: 'video' });
      const audioAtt = makeAttachment({ id: 'v1', type: 'audio' });
      const att = [fileAtt, videoAtt, audioAtt];

      const result = await applyAudioCapabilityPolicy(att, textOnlyModel(), { onTranscriptionError: noop });

      expect(result!.attachmentsForGateway).toEqual([fileAtt, videoAtt]);
    });

    it('returns voiceTranscript null when there are no audio attachments', async () => {
      const att = [makeAttachment({ id: 'f1', type: 'file' })];
      const result = await applyAudioCapabilityPolicy(att, textOnlyModel(), { onTranscriptionError: noop });
      expect(result!.voiceTranscript).toBeNull();
      expect(result!.attachmentsForGateway).toEqual(att);
      expect(transcribeAudioFile).not.toHaveBeenCalled();
    });
  });

  describe('transcription error handling', () => {
    it('returns null when user cancels after transcription error', async () => {
      transcribeAudioFile.mockRejectedValueOnce(
        new TranscriptionError('No speech', 'empty_result'),
      );
      const att = [makeAttachment({ id: 'v1', type: 'audio' })];
      const onTranscriptionError = jest.fn().mockResolvedValue(false);

      const result = await applyAudioCapabilityPolicy(att, textOnlyModel(), { onTranscriptionError });

      expect(result).toBeNull();
      expect(onTranscriptionError).toHaveBeenCalledTimes(1);
    });

    it('continues with failedAudioIds when user chooses to proceed', async () => {
      transcribeAudioFile.mockRejectedValueOnce(
        new TranscriptionError('Timed out', 'timeout'),
      );
      const att = [makeAttachment({ id: 'v1', type: 'audio' })];
      const onTranscriptionError = jest.fn().mockResolvedValue(true);

      const result = await applyAudioCapabilityPolicy(att, textOnlyModel(), { onTranscriptionError });

      expect(result).not.toBeNull();
      expect(result!.failedAudioIds).toContain('v1');
      expect(result!.voiceTranscript).toBeNull();
      expect(result!.attachmentsForGateway).toHaveLength(0);
    });

    it('mixes successful and failed transcriptions', async () => {
      transcribeAudioFile
        .mockResolvedValueOnce({ text: 'Good one', durationMs: 900 })
        .mockRejectedValueOnce(new TranscriptionError('Permission denied', 'permission_denied'));

      const att = [
        makeAttachment({ id: 'v1', type: 'audio' }),
        makeAttachment({ id: 'v2', type: 'audio' }),
      ];
      const onTranscriptionError = jest.fn().mockResolvedValue(true);

      const result = await applyAudioCapabilityPolicy(att, textOnlyModel(), { onTranscriptionError });

      expect(result!.voiceTranscript).toBe('Good one');
      expect(result!.failedAudioIds).toEqual(['v2']);
    });

    it('rethrows non-TranscriptionError errors', async () => {
      transcribeAudioFile.mockRejectedValueOnce(new Error('Unexpected crash'));
      const att = [makeAttachment({ id: 'v1', type: 'audio' })];
      await expect(
        applyAudioCapabilityPolicy(att, textOnlyModel(), { onTranscriptionError: noop }),
      ).rejects.toThrow('Unexpected crash');
    });
  });

  describe('null/undefined model', () => {
    it('treats null model as text-only (fail closed)', async () => {
      transcribeAudioFile.mockResolvedValueOnce({ text: 'Hi', durationMs: 400 });
      const att = [makeAttachment({ id: 'v1', type: 'audio' })];
      const result = await applyAudioCapabilityPolicy(att, null, { onTranscriptionError: noop });
      expect(result!.voiceTranscript).toBe('Hi');
      expect(result!.attachmentsForGateway).toHaveLength(0);
    });

    it('treats undefined model as text-only (fail closed)', async () => {
      transcribeAudioFile.mockResolvedValueOnce({ text: 'Hi', durationMs: 400 });
      const att = [makeAttachment({ id: 'v1', type: 'audio' })];
      const result = await applyAudioCapabilityPolicy(att, undefined, { onTranscriptionError: noop });
      expect(result!.voiceTranscript).toBe('Hi');
    });
  });
});
