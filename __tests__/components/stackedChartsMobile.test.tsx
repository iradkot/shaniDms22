import React from 'react';
import {Platform, type GestureResponderEvent} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {useStackedChartsTouchTooltip} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts/hooks/useStackedChartsTouchTooltip';
import type {StackedChartsTouchSession} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts/StackedHomeCharts.types';

const touch = (locationX: number, pageX: number, pageY = 200) =>
  ({
    nativeEvent: {locationX, pageX, locationY: 80, pageY},
  } as GestureResponderEvent);

describe('Mobile chart inspection', () => {
  let current: ReturnType<typeof useStackedChartsTouchTooltip>;
  let tree: renderer.ReactTestRenderer;
  const onTouchSessionChange = jest.fn();
  const Harness = ({endMs = 1000, width = 400}) => {
    current = useStackedChartsTouchTooltip({
      bgSamples: [],
      width,
      margin: {top: 20, right: 15, bottom: 30, left: 50},
      xDomain: [new Date(0), new Date(endMs)],
      onTouchSessionChange,
    });
    return null;
  };
  const lastSession = (): StackedChartsTouchSession =>
    onTouchSessionChange.mock.calls.filter(([session]) => session).at(-1)[0];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'android');
    onTouchSessionChange.mockClear();
    act(() => {
      tree = renderer.create(<Harness />);
    });
  });
  afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps a tapped value readable after release, releases the page, then expires', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    act(() => current.touchHandlers.onTouchEnd());
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
    act(() => jest.advanceTimersByTime(3999));
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    act(() => jest.advanceTimersByTime(1));
    expect(current.chartsTooltip).toBeNull();
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
  });

  it('does not jump when movement crosses an SVG child with a different local origin', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    act(() => current.touchHandlers.onTouchMove(touch(12, 351)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(600);
    act(() => current.touchHandlers.onTouchMove(touch(90, 384.5)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(700);
  });

  it('ignores finger jitter and keeps the selected value visible while held', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    act(() => current.touchHandlers.onTouchMove(touch(1, 320, 202)));
    act(() => jest.advanceTimersByTime(5000));
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(expect.any(Object));
  });

  it('updates from page moves only during an active touch and clamps chart edges', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    const session = lastSession();
    act(() => session.handlePageTouchMove(touch(0, 351)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(600);
    act(() => session.handlePageTouchMove(touch(0, -100)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(0);
    act(() => session.handlePageTouchMove(touch(0, 1000)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(1000);
    act(() => session.handlePageTouchEnd());
    act(() => session.handlePageTouchMove(touch(0, 351)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(1000);
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
  });

  it('stops inspection on vertical scroll intent and ignores later moves', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    const session = lastSession();
    act(() => current.touchHandlers.onTouchMove(touch(0, 330, 240)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
    act(() => session.handlePageTouchMove(touch(0, 400, 260)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
  });

  it('releases cancelled touches and does not revive them from page events', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    const session = lastSession();
    act(() => current.touchHandlers.onTouchCancel());
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
    act(() => session.handlePageTouchMove(touch(0, 351)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    act(() => jest.advanceTimersByTime(4000));
    expect(current.chartsTooltip).toBeNull();
  });

  it('ends inspection when a second finger arrives', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    act(() =>
      current.touchHandlers.onTouchStart({
        nativeEvent: {
          touches: [{pageX: 351}, {pageX: 500}],
          locationX: 251,
          pageX: 351,
        },
      } as GestureResponderEvent),
    );
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
    act(() => current.touchHandlers.onTouchMove(touch(0, 400)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
  });

  it('does not start inspection for a pinch gesture', () => {
    act(() =>
      current.touchHandlers.onTouchStart({
        nativeEvent: {touches: [{pageX: 351}, {pageX: 500}], locationX: 251},
      } as GestureResponderEvent),
    );
    expect(current.chartsTooltip).toBeNull();
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
  });

  it('anchors web touches to the surface rectangle, including scaled surfaces', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    act(() => tree.update(<Harness />));
    act(() =>
      current.touchHandlers.onTouchStart({
        currentTarget: {getBoundingClientRect: () => ({left: 40, width: 200})},
        nativeEvent: {
          locationX: 2,
          touches: [{pageX: 248.75, clientX: 148.75, pageY: 200}],
        },
      } as unknown as GestureResponderEvent),
    );
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    act(() => current.touchHandlers.onTouchMove(touch(4, 265.5)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(600);
  });

  it('a new touch cancels the old expiry timer', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    act(() => current.touchHandlers.onTouchEnd());
    act(() => jest.advanceTimersByTime(3000));
    act(() => current.touchHandlers.onTouchStart(touch(251, 351)));
    act(() => jest.advanceTimersByTime(5000));
    expect(current.chartsTooltip?.touchTimeMs).toBe(600);
  });

  it('preserves selection for equivalent ranges and clears it on a range change', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    const session = lastSession();
    act(() => tree.update(<Harness />));
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    act(() => tree.update(<Harness endMs={2000} />));
    expect(current.chartsTooltip).toBeNull();
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
    act(() => session.handlePageTouchMove(touch(0, 351)));
    expect(current.chartsTooltip).toBeNull();
  });

  it('clears selection after an orientation change', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    act(() => tree.update(<Harness width={800} />));
    expect(current.chartsTooltip).toBeNull();
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
  });

  it('releases the parent session and timer when the chart unmounts', () => {
    act(() => current.touchHandlers.onTouchStart(touch(217.5, 317.5)));
    act(() => current.touchHandlers.onTouchEnd());
    act(() => tree.unmount());
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
    expect(jest.getTimerCount()).toBe(0);
  });
});
