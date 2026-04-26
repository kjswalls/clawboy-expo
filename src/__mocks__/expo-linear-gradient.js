/**
 * Stub for expo-linear-gradient — renders as a View in tests.
 */
const React = require('react');

function LinearGradient({ children, style, colors: _colors, ...rest }) {
  const { View } = require('react-native');
  return React.createElement(View, { style, testID: 'linear-gradient', ...rest }, children);
}
LinearGradient.displayName = 'LinearGradient';

module.exports = { LinearGradient };
module.exports.default = LinearGradient;
