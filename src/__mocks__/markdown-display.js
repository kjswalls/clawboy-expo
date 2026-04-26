const React = require('react');
const { Text } = require('react-native');

// Minimal Markdown stub for tests — renders children as plain text.
function Markdown({ children, ...rest }) {
  return React.createElement(Text, rest, typeof children === 'string' ? children : null);
}

module.exports = Markdown;
module.exports.default = Markdown;
