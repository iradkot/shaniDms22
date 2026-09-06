import React from 'react';
import {Platform, type GestureResponderEvent} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {useHomeChartTouchSession} from 'app/containers/MainTabsNavigator/Containers/Home/hooks/useHomeChartTouchSession';

describe('Home chart page touch bridge', () => {
  let current: ReturnType<typeof useHomeChartTouchSession>;
  let tree: renderer.ReactTestRenderer;
  const Harness = () => {
    current = useHomeChartTouchSession();
    return null;
  };
  const makeSession = () => ({
    handlePageTouchMove: jest.fn(),
    handlePageTouchEnd: jest.fn(),
    handlePageTouchCancel: jest.fn(),
  });

  afterEach(() => {
    act(() => tree.unmount());
    jest.restoreAllMocks();
  });

  it.each(['android', 'ios'] as const)(
    'does not forward raw %s cancellation into the simultaneous chart gesture',
    platform => {
      jest.replaceProperty(Platform, 'OS', platform);
      act(() => {
        tree = renderer.create(<Harness />);
      });
      const session = makeSession();
      act(() => current.handleChartTouchSessionChange(session));

      expect(current.isChartTouchSessionActive).toBe(true);
      expect(current.scrollTouchHandlers.onTouchMove).toBeUndefined();
      expect(current.scrollTouchHandlers.onTouchEnd).toBeUndefined();
      expect(current.scrollTouchHandlers.onTouchCancel).toBeUndefined();
      expect(session.handlePageTouchCancel).not.toHaveBeenCalled();
    },
  );

  it('preserves web page tracking and releases the session when the finger lifts', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    act(() => {
      tree = renderer.create(<Harness />);
    });
    const session = makeSession();
    const movement = {
      nativeEvent: {pageX: 250, pageY: 300},
    } as GestureResponderEvent;
    act(() => current.handleChartTouchSessionChange(session));
    act(() => current.scrollTouchHandlers.onTouchMove?.(movement));
    expect(session.handlePageTouchMove).toHaveBeenCalledWith(movement);

    act(() => current.scrollTouchHandlers.onTouchEnd?.());
    expect(session.handlePageTouchEnd).toHaveBeenCalledTimes(1);
    expect(current.isChartTouchSessionActive).toBe(false);
    act(() => current.scrollTouchHandlers.onTouchMove?.(movement));
    expect(session.handlePageTouchMove).toHaveBeenCalledTimes(1);
  });
});
