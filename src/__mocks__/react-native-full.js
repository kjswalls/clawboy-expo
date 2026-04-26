/**
 * Full react-native mock for component snapshot tests.
 *
 * This file is used by the `components` Jest project via moduleNameMapper so
 * that `import { StyleSheet, View, ... } from 'react-native'` works in a Node
 * test environment without native modules.
 *
 * Key design principles:
 * - StyleSheet.create returns the object as-is (identity transform) so style
 *   objects render correctly in snapshots.
 * - UI components are thin wrappers around React.createElement so
 *   @testing-library/react-native can find, query, and snapshot them.
 * - Animated.Value is a trivial class that just holds a number.
 */
const React = require('react');

// ---------------------------------------------------------------------------
// StyleSheet
// ---------------------------------------------------------------------------
const StyleSheet = {
  create: (styles) => styles,
  flatten: (style) => {
    if (!style) return {};
    if (Array.isArray(style)) return Object.assign({}, ...style.map(StyleSheet.flatten));
    return style;
  },
  absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  hairlineWidth: 1,
  compose: (a, b) => [a, b],
};

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------
const Platform = {
  OS: 'ios',
  Version: 16,
  select: (obj) => obj.ios ?? obj.native ?? obj.default,
  isPad: false,
  isTV: false,
  isTesting: true,
};

// ---------------------------------------------------------------------------
// Generic component factory
// ---------------------------------------------------------------------------
function makeComponent(displayName) {
  const Comp = React.forwardRef(function ComponentStub({ children, testID, style, ...rest }, ref) {
    return React.createElement('View', { testID, ref, style, ...rest }, children);
  });
  Comp.displayName = displayName;
  return Comp;
}

// ---------------------------------------------------------------------------
// Core UI components
// ---------------------------------------------------------------------------
const View = makeComponent('View');
const Text = React.forwardRef(function Text({ children, style, ...rest }, ref) {
  return React.createElement('Text', { ref, style, ...rest }, children);
});
Text.displayName = 'Text';

const Image = React.forwardRef(function Image({ style, ...rest }, ref) {
  return React.createElement('Image', { ref, style, ...rest });
});
Image.displayName = 'Image';

const TextInput = React.forwardRef(function TextInput({ style, ...rest }, ref) {
  return React.createElement('TextInput', { ref, style, ...rest });
});
TextInput.displayName = 'TextInput';

function Pressable({ children, onPress, style, ...rest }) {
  const computedStyle = typeof style === 'function' ? style({ pressed: false }) : style;
  return React.createElement(
    'View',
    { onClick: onPress, style: computedStyle, ...rest },
    typeof children === 'function' ? children({ pressed: false }) : children,
  );
}
Pressable.displayName = 'Pressable';

function TouchableOpacity({ children, onPress, style, ...rest }) {
  return React.createElement('View', { onClick: onPress, style, ...rest }, children);
}
TouchableOpacity.displayName = 'TouchableOpacity';

function TouchableHighlight({ children, onPress, style, ...rest }) {
  return React.createElement('View', { onClick: onPress, style, ...rest }, children);
}
TouchableHighlight.displayName = 'TouchableHighlight';

function TouchableWithoutFeedback({ children, onPress, ...rest }) {
  return React.createElement(View, { onClick: onPress, ...rest }, children);
}
TouchableWithoutFeedback.displayName = 'TouchableWithoutFeedback';

const ScrollView = React.forwardRef(function ScrollView({ children, style, contentContainerStyle, ...rest }, ref) {
  return React.createElement('ScrollView', { ref, style, ...rest }, children);
});
ScrollView.displayName = 'ScrollView';

function FlatList({ data = [], renderItem, keyExtractor, ListEmptyComponent, ListHeaderComponent, ListFooterComponent, style, ...rest }) {
  const items = data.map((item, index) => {
    const key = keyExtractor ? keyExtractor(item, index) : String(index);
    return React.createElement(React.Fragment, { key }, renderItem({ item, index }));
  });
  return React.createElement(
    'View',
    { style, ...rest },
    ListHeaderComponent,
    items.length ? items : ListEmptyComponent,
    ListFooterComponent,
  );
}
FlatList.displayName = 'FlatList';

function SectionList({ sections = [], renderItem, renderSectionHeader, keyExtractor, style, ...rest }) {
  return React.createElement('View', { style, ...rest });
}

const Modal = makeComponent('Modal');
const SafeAreaView = makeComponent('SafeAreaView');
const KeyboardAvoidingView = makeComponent('KeyboardAvoidingView');
const ActivityIndicator = makeComponent('ActivityIndicator');
const RefreshControl = makeComponent('RefreshControl');
const Switch = makeComponent('Switch');

// ---------------------------------------------------------------------------
// Animated
// ---------------------------------------------------------------------------
class AnimatedValue {
  constructor(value) {
    this._value = value;
    this._listeners = new Map();
  }
  setValue(v) { this._value = v; }
  addListener(cb) { const id = String(Math.random()); this._listeners.set(id, cb); return id; }
  removeListener(id) { this._listeners.delete(id); }
  removeAllListeners() { this._listeners.clear(); }
  stopAnimation(cb) { cb && cb(this._value); }
  interpolate(config) {
    const { inputRange, outputRange } = config;
    const ratio = (this._value - inputRange[0]) / (inputRange[inputRange.length - 1] - inputRange[0]);
    const v = outputRange[0] + ratio * (outputRange[outputRange.length - 1] - outputRange[0]);
    return new AnimatedValue(v);
  }
}

class AnimatedValueXY {
  constructor({ x = 0, y = 0 } = {}) {
    this.x = new AnimatedValue(x);
    this.y = new AnimatedValue(y);
  }
  getLayout() { return { left: this.x, top: this.y }; }
  getTranslateTransform() { return [{ translateX: this.x }, { translateY: this.y }]; }
}

const AnimatedView = makeComponent('Animated.View');
const AnimatedText = React.forwardRef(function AnimatedText({ children, style, ...rest }, ref) {
  return React.createElement('Text', { ref, style, ...rest }, children);
});
AnimatedText.displayName = 'Animated.Text';
const AnimatedImage = makeComponent('Animated.Image');
const AnimatedScrollView = makeComponent('Animated.ScrollView');

const Animated = {
  Value: AnimatedValue,
  ValueXY: AnimatedValueXY,
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  ScrollView: AnimatedScrollView,
  FlatList,
  createAnimatedComponent: (Component) => Component,
  timing: (value, config) => ({
    start: (cb) => { value && (value._value = config.toValue); cb && cb({ finished: true }); },
    stop: () => {},
  }),
  spring: (value, config) => ({
    start: (cb) => { value && (value._value = config.toValue); cb && cb({ finished: true }); },
    stop: () => {},
  }),
  decay: (value) => ({
    start: (cb) => { cb && cb({ finished: true }); },
    stop: () => {},
  }),
  delay: (_ms) => ({ start: (cb) => { cb && cb({ finished: true }); }, stop: () => {} }),
  sequence: (anims) => ({ start: (cb) => { anims.forEach(a => a.start()); cb && cb({ finished: true }); }, stop: () => {} }),
  parallel: (anims) => ({ start: (cb) => { anims.forEach(a => a.start()); cb && cb({ finished: true }); }, stop: () => {} }),
  loop: (anim) => ({ start: (cb) => {}, stop: () => {} }),
  event: () => () => {},
  add: (a, b) => new AnimatedValue(0),
  subtract: (a, b) => new AnimatedValue(0),
  multiply: (a, b) => new AnimatedValue(0),
  divide: (a, b) => new AnimatedValue(0),
  modulo: (a, b) => new AnimatedValue(0),
  diffClamp: (a, min, max) => new AnimatedValue(0),
};

// ---------------------------------------------------------------------------
// AppState
// ---------------------------------------------------------------------------
const AppState = {
  currentState: 'active',
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  removeEventListener: jest.fn(),
};

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------
const Alert = {
  alert: jest.fn(),
  prompt: jest.fn(),
};

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------
const Linking = {
  openURL: jest.fn(() => Promise.resolve()),
  canOpenURL: jest.fn(() => Promise.resolve(true)),
  getInitialURL: jest.fn(() => Promise.resolve(null)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  removeEventListener: jest.fn(),
};

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------
const Keyboard = {
  dismiss: jest.fn(),
  addListener: jest.fn(() => ({ remove: jest.fn() })),
  removeAllListeners: jest.fn(),
};

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------
const Dimensions = {
  get: jest.fn((dim) => ({ width: 375, height: 812, scale: 1, fontScale: 1 })),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  removeEventListener: jest.fn(),
};

// ---------------------------------------------------------------------------
// NativeModules, NativeEventEmitter
// ---------------------------------------------------------------------------
const NativeModules = {};

function NativeEventEmitter() {
  return {
    addListener: jest.fn(() => ({ remove: jest.fn() })),
    removeAllListeners: jest.fn(),
  };
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------
const Easing = {
  linear: (t) => t,
  ease: (t) => t,
  quad: (t) => t * t,
  cubic: (t) => t * t * t,
  bezier: () => (t) => t,
  in: (e) => e,
  out: (e) => (t) => 1 - e(1 - t),
  inOut: (e) => e,
  step0: (n) => (n > 0 ? 1 : 0),
  step1: (n) => (n >= 1 ? 1 : 0),
  back: () => (t) => t,
  elastic: () => (t) => t,
  bounce: (t) => t,
  sin: (t) => t,
  circle: (t) => t,
  exp: (t) => t,
  poly: () => (t) => t,
};

// ---------------------------------------------------------------------------
// PixelRatio
// ---------------------------------------------------------------------------
const PixelRatio = {
  get: () => 2,
  getPixelSizeForLayoutSize: (size) => size * 2,
  roundToNearestPixel: (size) => Math.round(size * 2) / 2,
  getFontScale: () => 1,
};

// ---------------------------------------------------------------------------
// Haptics / Vibration
// ---------------------------------------------------------------------------
const Vibration = { vibrate: jest.fn(), cancel: jest.fn() };

// ---------------------------------------------------------------------------
// AccessibilityInfo
// ---------------------------------------------------------------------------
const AccessibilityInfo = {
  isScreenReaderEnabled: jest.fn(() => Promise.resolve(false)),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------
module.exports = {
  // Style
  StyleSheet,

  // Platform
  Platform,

  // Core components
  View,
  Text,
  Image,
  ImageBackground: makeComponent('ImageBackground'),
  TextInput,
  Pressable,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  ScrollView,
  FlatList,
  SectionList,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
  ActivityIndicator,
  RefreshControl,
  Switch,

  // Animated
  Animated,
  Easing,

  // APIs
  AppState,
  Alert,
  Linking,
  Keyboard,
  Dimensions,
  NativeModules,
  NativeEventEmitter,
  PixelRatio,
  Vibration,
  AccessibilityInfo,

  // Misc
  StatusBar: makeComponent('StatusBar'),
  useColorScheme: jest.fn(() => 'dark'),
  useWindowDimensions: jest.fn(() => ({ width: 375, height: 812, scale: 1, fontScale: 1 })),
  LogBox: { ignoreLogs: jest.fn(), ignoreAllLogs: jest.fn() },
  PanResponder: {
    create: jest.fn(() => ({ panHandlers: {} })),
  },
  InteractionManager: {
    runAfterInteractions: jest.fn((cb) => { cb(); return { cancel: jest.fn() }; }),
    createInteractionHandle: jest.fn(() => 1),
    clearInteractionHandle: jest.fn(),
  },
  BackHandler: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    removeEventListener: jest.fn(),
  },
  DeviceInfo: {},
  Share: {
    share: jest.fn(() => Promise.resolve({ action: 'sharedAction' })),
  },
  Clipboard: {
    setString: jest.fn(),
    getString: jest.fn(() => Promise.resolve('')),
  },
};
