/**
 * Stub for lucide-react-native — renders icons as null in component tests.
 * Real SVG rendering requires native modules unavailable in Jest.
 */
const React = require('react');
const { View } = require('react-native');

function createIcon(name) {
  function Icon({ size, color, style }) {
    return React.createElement(View, {
      testID: `icon-${name}`,
      style: [{ width: size, height: size }, style],
      accessibilityLabel: `icon-${name}`,
    });
  }
  Icon.displayName = name;
  return Icon;
}

const handler = {
  get(_target, prop) {
    if (typeof prop === 'string') {
      return createIcon(prop);
    }
    return undefined;
  },
};

module.exports = new Proxy({}, handler);
