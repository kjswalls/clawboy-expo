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

module.exports = {
  Swipeable: SwipeableMock,
  GestureHandlerRootView: passThrough('GestureHandlerRootView'),
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
};
