/**
 * Minimal FlashList mock for integration tests.
 *
 * Design goals:
 *  - Renders `data` items synchronously so React state driven by renderItem
 *    mounts in the same act() call.
 *  - Captures the `ref` via useImperativeHandle and exposes stable
 *    jest.fn() stubs for scrollToOffset / scrollToIndex / scrollToEnd.
 *  - Exposes imperative test helpers (__simulate*) that fire the prop
 *    callbacks synchronously — allows tests to drive onLayout /
 *    onContentSizeChange / onScroll / drag events without a native runtime.
 *  - Module-level __getLastRef() / __resetLastRef() let tests grab the spy
 *    without threading refs through the render tree.
 *
 * Fidelity limits (documented here so tests can account for them):
 *  - Does NOT implement maintainVisibleContentPosition behaviour — tests can
 *    only assert which config was *passed* via __getMvcp(), not that it moved
 *    the scroll position.
 *  - Does NOT reproduce FlashList 2.0.x scrollToIndex quirks on unmeasured
 *    tail items. Tests that rely on scrollToIndex behaviour need Layer 3.
 */
const React = require('react');
const { View } = require('react-native');

/** Module-level singleton so tests can grab the ref without props threading. */
let _lastRef = null;

const FlashList = React.forwardRef(function FlashList(props, ref) {
  // Always read the latest props via a ref so imperative helpers never close
  // over a stale prop snapshot.
  const propsRef = React.useRef(props);
  propsRef.current = props;

  // Stable mock fns — created once via useRef so call counts accumulate
  // across re-renders without resetting.
  const scrollToOffset = React.useRef(jest.fn()).current;
  const scrollToIndex = React.useRef(jest.fn()).current;
  const scrollToEnd = React.useRef(jest.fn()).current;
  const getNativeScrollRef = React.useRef(jest.fn(() => null)).current;

  const handle = React.useMemo(() => ({
    scrollToOffset,
    scrollToIndex,
    scrollToEnd,
    getNativeScrollRef,

    /** Fire FlashList.onLayout with a synthetic event. */
    __simulateLayout(w, h) {
      propsRef.current.onLayout?.({
        nativeEvent: { layout: { x: 0, y: 0, width: w, height: h } },
      });
    },

    /** Fire FlashList.onContentSizeChange. */
    __simulateContentSize(w, h) {
      propsRef.current.onContentSizeChange?.(w, h);
    },

    /**
     * Fire FlashList.onScroll with a synthetic NativeScrollEvent.
     * @param {{ y?: number, contentH?: number, layoutH?: number }} opts
     */
    __simulateScroll({ y = 0, contentH = 0, layoutH = 0 } = {}) {
      propsRef.current.onScroll?.({
        nativeEvent: {
          contentOffset: { x: 0, y },
          contentSize: { width: 375, height: contentH },
          layoutMeasurement: { width: 375, height: layoutH },
        },
      });
    },

    /** Fire FlashList.onScrollBeginDrag (user put finger down). */
    __simulateBeginDrag() {
      propsRef.current.onScrollBeginDrag?.();
    },

    /** Fire FlashList.onScrollEndDrag (user lifted finger). */
    __simulateEndDrag() {
      propsRef.current.onScrollEndDrag?.();
    },

    /**
     * Return the current maintainVisibleContentPosition prop value.
     * Used by tests to assert MVCP config without simulating native scroll.
     */
    __getMvcp() {
      return propsRef.current.maintainVisibleContentPosition;
    },
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  React.useImperativeHandle(ref, () => handle, [handle]);

  // Update module singleton so tests can call __getLastRef() without
  // passing a ref through the render tree.
  _lastRef = handle;

  // Render items synchronously.
  const { data = [], renderItem, keyExtractor, extraData, ListFooterComponent } = props;
  const children = data.map((item, index) => {
    const key = keyExtractor ? keyExtractor(item, index) : String(index);
    return React.createElement(
      View,
      { key },
      renderItem?.({ item, index, target: 'Cell', extraData }),
    );
  });

  const footer = ListFooterComponent
    ? typeof ListFooterComponent === 'function'
      ? React.createElement(ListFooterComponent)
      : ListFooterComponent
    : null;

  return React.createElement(
    View,
    { testID: props.testID ?? 'flash-list' },
    ...children,
    footer,
  );
});

FlashList.displayName = 'FlashListMock';

module.exports = {
  FlashList,
  /** Returns the imperative handle of the most recently mounted FlashList. */
  __getLastRef: () => _lastRef,
  /** Resets the singleton. Call in beforeEach to avoid cross-test pollution. */
  __resetLastRef: () => { _lastRef = null; },
};
