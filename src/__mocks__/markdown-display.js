const React = require('react');
const { Text } = require('react-native');

// Minimal Markdown stub for tests — renders children as plain text.
// Accepts either a string (typical) or an array (when callers pass a
// pre-parsed AST via the markdown-AST cache); in the array case we render
// nothing, since snapshot tests assert on the rendered tree shape rather
// than on parsed-markdown content.
function Markdown({ children, ...rest }) {
  if (typeof children === 'string') {
    return React.createElement(Text, rest, children);
  }
  return React.createElement(Text, rest, null);
}

module.exports = Markdown;
module.exports.default = Markdown;
// `parser` is intentionally NOT exported. The real library exports it; our
// markdown-AST cache feature-detects that export and falls back to passing the
// raw content string when absent (i.e. in this mock), so tests continue to
// exercise the string-children code path.
