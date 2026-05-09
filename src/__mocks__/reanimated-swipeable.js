/**
 * Stub for react-native-gesture-handler/ReanimatedSwipeable in Jest component tests.
 */
const React = require('react');

class ReanimatedSwipeableMock extends React.Component {
  close() {}
  openLeft() {}
  openRight() {}
  reset() {}

  render() {
    const { View } = require('react-native');
    return React.createElement(View, {}, this.props.children);
  }
}

module.exports = ReanimatedSwipeableMock;
module.exports.default = ReanimatedSwipeableMock;
module.exports.SwipeDirection = { LEFT: 'left', RIGHT: 'right' };
