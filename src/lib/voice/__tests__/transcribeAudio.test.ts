import { transcribeAudioFile, TranscriptionError } from '../transcribeAudio';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { __controls__, ExpoSpeechRecognitionModule } = require('expo-speech-recognition');

const TEST_URI = 'file:///tmp/voice-note.m4a';

beforeEach(() => {
  __controls__.reset();
  jest.clearAllMocks();
  // Re-install jest.fn implementations that clearAllMocks wipes.
  ExpoSpeechRecognitionModule.requestPermissionsAsync.mockImplementation(async () => ({
    granted: ExpoSpeechRecognitionModule._granted,
    status: ExpoSpeechRecognitionModule._granted ? 'granted' : 'denied',
    canAskAgain: true,
    expires: 'never',
  }));
  ExpoSpeechRecognitionModule.isRecognitionAvailable.mockImplementation(
    () => ExpoSpeechRecognitionModule._available,
  );
  ExpoSpeechRecognitionModule.start.mockImplementation(() => undefined);
  ExpoSpeechRecognitionModule.abort.mockImplementation(() => undefined);
});

describe('transcribeAudioFile', () => {
  it('resolves with the final transcript on success', async () => {
    const promise = transcribeAudioFile(TEST_URI);
    // Yield so that start() runs and listeners are registered.
    await Promise.resolve();
    __controls__.simulateSuccess('Good morning everyone');
    const result = await promise;
    expect(result.text).toBe('Good morning everyone');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('throws TranscriptionError with code permission_denied when not granted', async () => {
    ExpoSpeechRecognitionModule._granted = false;
    await expect(transcribeAudioFile(TEST_URI)).rejects.toMatchObject({
      name: 'TranscriptionError',
      code: 'permission_denied',
    });
  });

  it('throws TranscriptionError with code unavailable when recognition is unavailable', async () => {
    ExpoSpeechRecognitionModule._available = false;
    await expect(transcribeAudioFile(TEST_URI)).rejects.toMatchObject({
      name: 'TranscriptionError',
      code: 'unavailable',
    });
  });

  it('throws TranscriptionError with code empty_result on no-speech error', async () => {
    const promise = transcribeAudioFile(TEST_URI);
    await Promise.resolve();
    __controls__.simulateError('no-speech', 'No speech detected');
    await expect(promise).rejects.toMatchObject({
      name: 'TranscriptionError',
      code: 'empty_result',
    });
  });

  it('throws TranscriptionError with code empty_result when end fires with no transcript', async () => {
    const promise = transcribeAudioFile(TEST_URI);
    await Promise.resolve();
    __controls__.simulateEmptyEnd();
    await expect(promise).rejects.toMatchObject({
      name: 'TranscriptionError',
      code: 'empty_result',
    });
  });

  it('calls start() with requiresOnDeviceRecognition: true and the audio URI', async () => {
    const promise = transcribeAudioFile(TEST_URI, { localeTag: 'fr-FR' });
    await Promise.resolve();
    __controls__.simulateSuccess('Bonjour');
    await promise;
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({
        requiresOnDeviceRecognition: true,
        audioSource: { uri: TEST_URI },
        lang: 'fr-FR',
      }),
    );
  });

  it('uses en-US as default locale', async () => {
    const promise = transcribeAudioFile(TEST_URI);
    await Promise.resolve();
    __controls__.simulateSuccess('test');
    await promise;
    expect(ExpoSpeechRecognitionModule.start).toHaveBeenCalledWith(
      expect.objectContaining({ lang: 'en-US' }),
    );
  });

  it('throws a TranscriptionError instance', async () => {
    ExpoSpeechRecognitionModule._granted = false;
    await expect(transcribeAudioFile(TEST_URI)).rejects.toBeInstanceOf(TranscriptionError);
  });

  it('calls abort() when timeout fires', async () => {
    jest.useFakeTimers();
    const promise = transcribeAudioFile(TEST_URI, { timeoutMs: 500 });
    await Promise.resolve();
    jest.advanceTimersByTime(600);
    // Flush microtasks after timer fires.
    await Promise.resolve();
    await expect(promise).rejects.toMatchObject({
      name: 'TranscriptionError',
      code: 'timeout',
    });
    expect(ExpoSpeechRecognitionModule.abort).toHaveBeenCalled();
    jest.useRealTimers();
  });
});
