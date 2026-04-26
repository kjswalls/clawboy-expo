import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import type { ExpoSpeechRecognitionErrorCode } from 'expo-speech-recognition';

export type TranscriptionErrorCode =
  | 'permission_denied'
  | 'unavailable'
  | 'empty_result'
  | 'timeout'
  | 'audio_error'
  | 'unknown';

export class TranscriptionError extends Error {
  constructor(
    message: string,
    readonly code: TranscriptionErrorCode,
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}

export interface TranscriptionResult {
  text: string;
  durationMs: number;
}

interface TranscribeOptions {
  /** BCP-47 locale tag, e.g. "en-US". Defaults to device locale. */
  localeTag?: string;
  /**
   * Maximum time to wait for transcription to complete in ms.
   * Defaults to 60 000 ms (1 min). Voice notes are capped at 120 s
   * by the recorder but individual recognitions usually finish within
   * a few seconds of the audio ending.
   */
  timeoutMs?: number;
}

function mapNativeError(code: ExpoSpeechRecognitionErrorCode): TranscriptionErrorCode {
  switch (code) {
    case 'not-allowed':
      return 'permission_denied';
    case 'service-not-allowed':
    case 'language-not-supported':
      return 'unavailable';
    case 'no-speech':
    case 'speech-timeout':
      return 'empty_result';
    case 'audio-capture':
      return 'audio_error';
    default:
      return 'unknown';
  }
}

/**
 * Transcribes a local audio file using on-device speech recognition.
 *
 * Audio never leaves the device (`requiresOnDeviceRecognition: true`).
 * If the device does not have the on-device model installed for the
 * requested locale, a `TranscriptionError` with code `'unavailable'` is
 * thrown rather than falling back to network-based recognition.
 *
 * @throws {TranscriptionError}
 */
export async function transcribeAudioFile(
  uri: string,
  opts: TranscribeOptions = {},
): Promise<TranscriptionResult> {
  const { localeTag = 'en-US', timeoutMs = 60_000 } = opts;
  const startedAt = Date.now();

  const perms = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perms.granted) {
    throw new TranscriptionError(
      'Speech recognition permission was not granted.',
      'permission_denied',
    );
  }

  if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
    throw new TranscriptionError(
      'On-device speech recognition is not available on this device.',
      'unavailable',
    );
  }

  return new Promise<TranscriptionResult>((resolve, reject) => {
    let finalTranscript = '';
    let settled = false;

    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // Clean up listeners after the microtask queue drains so that the `end`
      // event (which fires after `result`) can still be consumed by the module.
      void Promise.resolve().then(() => {
        resultSub.remove();
        errorSub.remove();
        endSub.remove();
      });
      fn();
    };

    const timer = setTimeout(() => {
      ExpoSpeechRecognitionModule.abort();
      settle(() =>
        reject(
          new TranscriptionError(
            'Transcription timed out waiting for a result.',
            'timeout',
          ),
        ),
      );
    }, timeoutMs);

    const resultSub = ExpoSpeechRecognitionModule.addListener('result', (event) => {
      // Capture the best alternative from the last final result.
      if (event.isFinal && event.results.length > 0) {
        finalTranscript = event.results[0]?.transcript ?? '';
      } else if (!event.isFinal && event.results.length > 0) {
        // Keep a running partial in case `end` fires without a final result.
        finalTranscript = event.results[0]?.transcript ?? finalTranscript;
      }
    });

    const errorSub = ExpoSpeechRecognitionModule.addListener('error', (event) => {
      settle(() =>
        reject(
          new TranscriptionError(
            event.message || `Speech recognition error: ${event.error}`,
            mapNativeError(event.error),
          ),
        ),
      );
    });

    const endSub = ExpoSpeechRecognitionModule.addListener('end', () => {
      settle(() => {
        const trimmed = finalTranscript.trim();
        if (!trimmed) {
          reject(
            new TranscriptionError(
              'No speech was detected in the recording.',
              'empty_result',
            ),
          );
          return;
        }
        resolve({ text: trimmed, durationMs: Date.now() - startedAt });
      });
    });

    try {
      ExpoSpeechRecognitionModule.start({
        lang: localeTag,
        requiresOnDeviceRecognition: true,
        interimResults: false,
        addsPunctuation: true,
        audioSource: { uri },
      });
    } catch (err) {
      settle(() =>
        reject(
          new TranscriptionError(
            err instanceof Error ? err.message : 'Failed to start speech recognizer.',
            'unknown',
          ),
        ),
      );
    }
  });
}
