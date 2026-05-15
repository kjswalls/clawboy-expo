/**
 * Jest stub for @shopify/react-native-skia — keeps component tests from loading
 * native Skia.
 */
const React = require('react');
const { View } = require('react-native');

const passthrough = (name) =>
  function SkiaStub(props) {
    const { children, style, ...rest } = props;
    return React.createElement(
      View,
      { ...rest, style, collapsable: false, testID: `skia-${name}` },
      children,
    );
  };

module.exports = {
  Canvas: passthrough('Canvas'),
  Group: passthrough('Group'),
  Rect: passthrough('Rect'),
  RoundedRect: passthrough('RoundedRect'),
  LinearGradient: () => null,
  vec: (x, y) => ({ x, y }),
  rect: (x, y, w, h) => ({ x, y, width: w, height: h }),
  rrect: (r, rx, ry) => ({ rect: r, rx, ry }),
  Skia: {},
};
