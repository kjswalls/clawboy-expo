/**
 * Jest mock for expo-speech-recognition.
 *
 * Provides a controllable ExpoSpeechRecognitionModule. Call the helpers on
 * `__controls__` to simulate events from within tests. Always call
 * `__controls__.reset()` in beforeEach to clear listeners.
 */

// Shared listener registry — survives jest.clearAllMocks() because it lives
// outside the mocked fn instances.
const _listeners = {};

function _addListener(eventName, listener) {
  if (!_listeners[eventName]) _listeners[eventName] = [];
  _listeners[eventName].push(listener);
  return {
    remove() {
      _listeners[eventName] = (_listeners[eventName] || []).filter((l) => l !== listener);
    },
  };
}

function _fire(eventName, payload) {
  for (const l of _listeners[eventName] || []) {
    l(payload);
  }
}

const __controls__ = {
  reset() {
    for (const key of Object.keys(_listeners)) {
      _listeners[key] = [];
    }
    ExpoSpeechRecognitionModule._granted = true;
    ExpoSpeechRecognitionModule._available = true;
  },
  /** Emits a final result then end. */
  simulateSuccess(transcript = 'Hello world') {
    _fire('result', { isFinal: true, results: [{ transcript, confidence: 0.95, segments: [] }] });
    _fire('end', null);
  },
  /** Emits an error then end. */
  simulateError(code = 'no-speech', message = 'No speech detected') {
    _fire('error', { error: code, message });
    _fire('end', null);
  },
  /** Emits end with no prior result (empty transcript). */
  simulateEmptyEnd() {
    _fire('end', null);
  },
};

const ExpoSpeechRecognitionModule = {
  _granted: true,
  _available: true,

  requestPermissionsAsync: jest.fn(async function () {
    return {
      granted: ExpoSpeechRecognitionModule._granted,
      status: ExpoSpeechRecognitionModule._granted ? 'granted' : 'denied',
      canAskAgain: true,
      expires: 'never',
    };
  }),

  isRecognitionAvailable: jest.fn(function () {
    return ExpoSpeechRecognitionModule._available;
  }),

  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),

  // Intentionally NOT a jest.fn() wrapper around _addListener so that
  // jest.clearAllMocks() does not break the registry — we re-point below.
  addListener: jest.fn(_addListener),
};

// After clearAllMocks replaces .addListener's implementation with () => undefined,
// restore it. We do this by wrapping in a way that Jest's spy can be reset safely.
// The safest pattern: always re-delegate through the stable _addListener fn.
Object.defineProperty(ExpoSpeechRecognitionModule, 'addListener', {
  configurable: true,
  get() {
    return _addListener;
  },
});

module.exports = {
  ExpoSpeechRecognitionModule,
  __controls__,
};
