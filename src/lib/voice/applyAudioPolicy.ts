/**
 * Pure helper that applies the audio-capability policy to a list of attachments
 * before a `chat.send` call.
 *
 * Extracted from `useChat.sendMessage` so the decision logic can be unit-tested
 * without a React render tree.
 */

import type { Model } from '@/types';
import type { InputAttachment } from '@/components/input/types';
import { modelSupportsAudioInput } from './modelAudioSupport';
import { transcribeAudioFile, TranscriptionError } from './transcribeAudio';

export interface AudioPolicyResult {
  /** Attachments that should be forwarded to `prepareChatAttachmentsFromInput`. */
  attachmentsForGateway: InputAttachment[];
  /**
   * Voice-note transcript to prepend to the gateway message content, or `null`
   * when all audio attachments were forwarded natively.
   */
  voiceTranscript: string | null;
  /**
   * Audio attachments whose transcription failed but the caller chose to
   * continue. They are excluded from `attachmentsForGateway` and produce no
   * transcript — the model simply won't receive them.
   */
  failedAudioIds: string[];
}

export interface AudioPolicyCallbacks {
  /** Called when a transcription error occurs. Must resolve with `true` (proceed) or `false` (cancel send). */
  onTranscriptionError: (attachment: InputAttachment, err: TranscriptionError) => Promise<boolean>;
  /** BCP-47 locale tag used for STT transcription. Defaults to 'en-US'. */
  localeTag?: string;
}

/**
 * Applies the audio-capability gate:
 * - If the model can hear audio → passes all attachments through unchanged.
 * - If not → transcribes each audio attachment on-device and strips it from
 *   the gateway payload.
 *
 * @returns `null` when the caller should abort the send (user cancelled).
 */
export async function applyAudioCapabilityPolicy(
  attachments: InputAttachment[],
  model: Model | null | undefined,
  callbacks: AudioPolicyCallbacks,
): Promise<AudioPolicyResult | null> {
  const canHearAudio = modelSupportsAudioInput(model);

  if (canHearAudio) {
    return {
      attachmentsForGateway: attachments,
      voiceTranscript: null,
      failedAudioIds: [],
    };
  }

  const audioAtts = attachments.filter((a) => a.type === 'audio');
  const nonAudioAtts = attachments.filter((a) => a.type !== 'audio');

  if (audioAtts.length === 0) {
    return {
      attachmentsForGateway: attachments,
      voiceTranscript: null,
      failedAudioIds: [],
    };
  }

  const transcripts: string[] = [];
  const failedAudioIds: string[] = [];

  for (const a of audioAtts) {
    try {
      const result = await transcribeAudioFile(a.uri, { localeTag: callbacks.localeTag });
      transcripts.push(result.text);
    } catch (err) {
      if (err instanceof TranscriptionError) {
        const proceed = await callbacks.onTranscriptionError(a, err);
        if (!proceed) {
          return null;
        }
        failedAudioIds.push(a.id);
      } else {
        // Unexpected non-transcription error — rethrow.
        throw err;
      }
    }
  }

  return {
    attachmentsForGateway: nonAudioAtts,
    voiceTranscript: transcripts.length > 0 ? transcripts.join('\n\n') : null,
    failedAudioIds,
  };
}
