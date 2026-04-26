/**
 * Minimal MaskedView stub for tests — renders children without masking.
 */
const React = require('react');

function MaskedView({ children, maskElement, ...rest }) {
  const { View } = require('react-native');
  return React.createElement(View, rest, maskElement, children);
}

module.exports = MaskedView;
module.exports.default = MaskedView;
