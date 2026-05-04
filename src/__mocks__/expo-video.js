/**
 * Stub for expo-video — avoids native module in Jest.
 */
const React = require('react');
const { View } = require('react-native');

function createMockPlayer() {
  return {
    loop: false,
    muted: false,
    play: jest.fn(),
    pause: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  };
}

function useVideoPlayer(_source, setup) {
  const playerRef = React.useRef(null);
  if (playerRef.current === null) {
    const player = createMockPlayer();
    if (typeof setup === 'function') {
      setup(player);
    }
    playerRef.current = player;
  }
  return playerRef.current;
}

const VideoView = React.forwardRef(function VideoViewStub({ style, ...rest }, ref) {
  return React.createElement(View, { ref, style, testID: 'expo-video-view', ...rest });
});
VideoView.displayName = 'VideoView';

module.exports = {
  useVideoPlayer,
  VideoView,
};
