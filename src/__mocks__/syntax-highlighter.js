/**
 * Stub for react-syntax-highlighter in component tests.
 * The real module uses ESM dependencies (refractor/hastscript) that can't be
 * transformed by Jest in the test environment.
 */
const React = require('react');

function SyntaxHighlighter({ children, style, ...rest }) {
  const { Text } = require('react-native');
  return React.createElement(Text, { testID: 'syntax-highlighter', ...rest }, children);
}

SyntaxHighlighter.registerLanguage = () => {};
SyntaxHighlighter.Light = SyntaxHighlighter;
SyntaxHighlighter.Prism = SyntaxHighlighter;
SyntaxHighlighter.PrismLight = SyntaxHighlighter;

module.exports = SyntaxHighlighter;
module.exports.default = SyntaxHighlighter;
module.exports.Light = SyntaxHighlighter;
module.exports.Prism = SyntaxHighlighter;
module.exports.PrismLight = SyntaxHighlighter;
// Style stub — all style objects map to empty
module.exports.atomOneDark = {};
module.exports.atomOneLight = {};
module.exports.vs = {};
module.exports.vscDarkPlus = {};
