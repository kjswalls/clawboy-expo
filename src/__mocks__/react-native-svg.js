/**
 * Stub for react-native-svg in Jest component tests.
 */
const React = require('react');

function makeElement(name) {
  function SvgElement(props) {
    const { View } = require('react-native');
    return React.createElement(View, { testID: name });
  }
  SvgElement.displayName = name;
  return SvgElement;
}

const Svg = makeElement('Svg');

module.exports = Svg;
module.exports.default = Svg;
module.exports.Svg = Svg;
module.exports.Line = makeElement('Line');
module.exports.Circle = makeElement('Circle');
module.exports.Rect = makeElement('Rect');
module.exports.Path = makeElement('Path');
module.exports.G = makeElement('G');
module.exports.Text = makeElement('SvgText');
module.exports.Defs = makeElement('Defs');
module.exports.ClipPath = makeElement('ClipPath');
module.exports.Use = makeElement('Use');
