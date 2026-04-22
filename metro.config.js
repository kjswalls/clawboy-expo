const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Polyfill Node built-ins that some npm packages (e.g. markdown-it via
// @ronradtke/react-native-markdown-display) try to require at runtime.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  punycode: path.resolve(__dirname, 'node_modules/punycode'),
};

module.exports = config;
