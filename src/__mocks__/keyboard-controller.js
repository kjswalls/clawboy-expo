// Minimal mock for react-native-keyboard-controller.
// MessageList uses useKeyboardHandler to track keyboard height changes.
// In tests there is no native keyboard, so the handler is a no-op.
const useKeyboardHandler = jest.fn();
module.exports = { useKeyboardHandler };
