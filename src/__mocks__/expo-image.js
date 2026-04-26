/**
 * Stub for expo-image — renders as Image in tests.
 */
const React = require('react');

const Image = React.forwardRef(function ExpoImage({ style, source, contentFit, ...rest }, ref) {
  const { Image: RNImage } = require('react-native');
  const uri = typeof source === 'string' ? source : source?.uri;
  return React.createElement(RNImage, { ref, style, source: uri ? { uri } : undefined, testID: 'expo-image', ...rest });
});
Image.displayName = 'ExpoImage';

module.exports = { Image };
module.exports.default = Image;
module.exports.Image = Image;
