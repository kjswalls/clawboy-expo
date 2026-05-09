/**
 * Stub for react-native-gesture-handler in Jest component tests.
 * Uses lazy requires to avoid module-level circular dependency issues.
 */
const React = require('react');

function passThrough(displayName) {
  function GestureStub({ children, ...props }) {
    const { View } = require('react-native');
    return React.createElement(View, props, children);
  }
  GestureStub.displayName = displayName;
  return GestureStub;
}

class SwipeableMock extends React.Component {
  close() {}
  render() {
    const { View } = require('react-native');
    return React.createElement(View, {}, this.props.children);
  }
}

// Chainable no-op builder for Gesture.Pan() / Gesture.Tap() etc.
function makeGestureBuilder() {
  const builder = {};
  const chainMethods = [
    'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY',
    'minPointers', 'maxPointers', 'minDistance', 'onStart', 'onUpdate',
    'onEnd', 'onFinalize', 'onTouchesDown', 'onTouchesUp', 'onTouchesCancelled',
    'simultaneousWithExternalGesture', 'requireExternalGestureToFail',
    'blocksExternalGesture', 'enabled', 'shouldCancelWhenOutside',
    'hitSlop', 'activateAfterLongPress', 'numberOfTaps', 'maxDuration',
  ];
  chainMethods.forEach((m) => {
    builder[m] = () => builder;
  });
  return builder;
}

const Gesture = {
  Pan: makeGestureBuilder,
  Tap: makeGestureBuilder,
  LongPress: makeGestureBuilder,
  Pinch: makeGestureBuilder,
  Rotation: makeGestureBuilder,
  Fling: makeGestureBuilder,
  Native: makeGestureBuilder,
  Manual: makeGestureBuilder,
  Race: (...gs) => gs[0] ?? makeGestureBuilder(),
  Simultaneous: (...gs) => gs[0] ?? makeGestureBuilder(),
  Exclusive: (...gs) => gs[0] ?? makeGestureBuilder(),
};

module.exports = {
  Swipeable: SwipeableMock,
  GestureHandlerRootView: passThrough('GestureHandlerRootView'),
  GestureDetector: passThrough('GestureDetector'),
  PanGestureHandler: passThrough('PanGestureHandler'),
  TapGestureHandler: passThrough('TapGestureHandler'),
  LongPressGestureHandler: passThrough('LongPressGestureHandler'),
  NativeViewGestureHandler: passThrough('NativeViewGestureHandler'),
  ScrollView: passThrough('GestureScrollView'),
  FlatList: passThrough('GestureFlatList'),
  gestureHandlerRootHOC: (Component) => Component,
  State: {},
  Directions: {},
  createNativeWrapper: (Component) => Component,
  Gesture,
};
