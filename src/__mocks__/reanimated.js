/**
 * Minimal react-native-reanimated mock for Jest component tests.
 * Uses lazy requires to avoid circular dependency issues at module load time.
 */
const React = require('react');

// Shared values are plain objects with a `.value` property.
const useSharedValue = (init) => ({ value: init });

// Animated style hooks return empty style objects in tests.
const useAnimatedStyle = (_fn) => ({});

// Animation builders — return the target value immediately (or a safe sentinel).
const withTiming = (toValue) => toValue;
const withSpring = (toValue) => toValue;
const withDelay = (_delay, animation) => animation;
const withSequence = (...anims) => anims[anims.length - 1];
const withRepeat = (animation) => animation;
const withDecay = () => 0;
const cancelAnimation = () => {};

const Easing = {
  linear: (t) => t,
  ease: (t) => t,
  cubic: (t) => t,
  quad: (t) => t,
  bezier: () => (t) => t,
  circle: (t) => t,
  sin: (t) => t,
  exp: (t) => t,
  elastic: () => (t) => t,
  back: () => (t) => t,
  bounce: (t) => t,
  poly: () => (t) => t,
  in: (e) => e,
  out: (e) => e,
  inOut: (e) => e,
};

// Entering/exiting animation builder stubs.
const makeAnimBuilder = () => {
  const b = { duration: () => b, delay: () => b, easing: () => b, springify: () => b };
  return b;
};
const FadeIn = makeAnimBuilder();
const FadeInUp = makeAnimBuilder();
const FadeInDown = makeAnimBuilder();
const FadeOut = makeAnimBuilder();
const FadeOutDown = makeAnimBuilder();
const SlideInLeft = makeAnimBuilder();
const SlideOutLeft = makeAnimBuilder();

// Animated components — forward to their RN equivalents using lazy require.
function makeAnimatedComponent(baseType) {
  return function AnimatedStub({ entering: _e, exiting: _ex, style, ...props }) {
    const { createElement } = require('react');
    const RN = require('react-native');
    return createElement(RN[baseType] || RN.View, { style, ...props });
  };
}

const AnimatedView = makeAnimatedComponent('View');
const AnimatedText = makeAnimatedComponent('Text');
const AnimatedImage = makeAnimatedComponent('Image');
const AnimatedScrollView = makeAnimatedComponent('ScrollView');

const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  Image: AnimatedImage,
  ScrollView: AnimatedScrollView,
  FlatList: AnimatedView,
  createAnimatedComponent: (Component) => Component,
};

const useAnimatedRef = () => ({ current: null });
const useDerivedValue = (fn) => ({ value: fn() });

module.exports = {
  default: Animated,
  ...Animated,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
  withSequence,
  withRepeat,
  withDecay,
  cancelAnimation,
  Easing,
  FadeIn,
  FadeInUp,
  FadeInDown,
  FadeOut,
  FadeOutDown,
  SlideInLeft,
  SlideOutLeft,
  useAnimatedRef,
  useDerivedValue,
  runOnJS: (fn) => fn,
  runOnUI: (fn) => fn,
};
