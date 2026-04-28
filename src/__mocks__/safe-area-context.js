const React = require('react');

const SafeAreaProvider = ({ children }) => children;
const SafeAreaConsumer = ({ children }) => children({ top: 0, bottom: 0, left: 0, right: 0 });
const SafeAreaView = ({ children, ...props }) => React.createElement('View', props, children);

function useSafeAreaInsets() {
  return { top: 0, bottom: 0, left: 0, right: 0 };
}

function useSafeAreaFrame() {
  return { x: 0, y: 0, width: 375, height: 812 };
}

const initialWindowMetrics = {
  insets: { top: 44, bottom: 34, left: 0, right: 0 },
  frame: { x: 0, y: 0, width: 375, height: 812 },
};

module.exports = {
  SafeAreaProvider,
  SafeAreaConsumer,
  SafeAreaView,
  useSafeAreaInsets,
  useSafeAreaFrame,
  initialWindowMetrics,
};
