import React from 'react';
import {Platform} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {useStackedChartsTouchTooltip} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts/hooks/useStackedChartsTouchTooltip';

type TooltipState = ReturnType<typeof useStackedChartsTouchTooltip>;
const point = (clientX: number, left = 100) => ({
  nativeEvent: {clientX},
  currentTarget: {getBoundingClientRect: () => ({left})},
});

describe('Stacked chart mouse inspection', () => {
  let current: TooltipState;
  let tree: renderer.ReactTestRenderer;
  const onTouchSessionChange = jest.fn();
  const Harness = () => {
    current = useStackedChartsTouchTooltip({
      bgSamples: [],
      width: 400,
      margin: {top: 20, right: 15, bottom: 30, left: 50},
      xDomain: [new Date(0), new Date(1000)],
      onTouchSessionChange,
    });
    return null;
  };
  afterEach(() => {
    act(() => tree.unmount());
    jest.useRealTimers();
    onTouchSessionChange.mockClear();
    jest.restoreAllMocks();
  });

  it('uses viewport coordinates, clamps plot edges, and clears on mouse leave', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    act(() => {
      tree = renderer.create(<Harness />);
    });
    act(() => {
      current.mouseHandlers.onMouseMove?.(point(317.5));
    });
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    expect(
      onTouchSessionChange.mock.calls.some(([session]) => session != null),
    ).toBe(false);
    act(() => {
      current.mouseHandlers.onMouseMove?.(point(800));
    });
    expect(current.chartsTooltip?.touchTimeMs).toBe(1000);
    const preventDefault = jest.fn();
    act(() => {
      current.mouseHandlers.onMouseDown?.({...point(0), preventDefault});
    });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(current.chartsTooltip?.touchTimeMs).toBe(0);
    act(() => {
      current.mouseHandlers.onMouseLeave?.();
    });
    expect(current.chartsTooltip).toBeNull();
  });

  it('ignores invalid pointer coordinates', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    act(() => {
      tree = renderer.create(<Harness />);
    });
    act(() => {
      current.mouseHandlers.onMouseMove?.(point(Number.NaN));
    });
    expect(current.chartsTooltip).toBeNull();
  });

  it('keeps mouse handlers out of native views and preserves the touch handlers', () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(current.mouseHandlers).toEqual({});
    expect(current.touchHandlers.onTouchMove).toEqual(expect.any(Function));
  });

  it('ignores synthetic mouse events after a touch, then restores real mouse hover', () => {
    jest.useFakeTimers();
    jest.replaceProperty(Platform, 'OS', 'web');
    act(() => {
      tree = renderer.create(<Harness />);
    });
    act(() =>
      current.touchHandlers.onTouchStart({
        nativeEvent: {locationX: 217.5, pageX: 317.5},
      } as any),
    );
    act(() => current.touchHandlers.onTouchEnd());
    const preventDefault = jest.fn();
    act(() => {
      current.mouseHandlers.onMouseMove?.(point(800));
      current.mouseHandlers.onMouseDown?.({...point(0), preventDefault});
      current.mouseHandlers.onMouseLeave?.();
    });
    expect(current.chartsTooltip?.touchTimeMs).toBe(500);
    expect(preventDefault).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(801));
    act(() => current.mouseHandlers.onMouseMove?.(point(351)));
    expect(current.chartsTooltip?.touchTimeMs).toBe(600);
    act(() => current.mouseHandlers.onMouseLeave?.());
    expect(current.chartsTooltip).toBeNull();
  });

  it('ignores mouse events explicitly marked as touch-generated', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    act(() => {
      tree = renderer.create(<Harness />);
    });
    act(() =>
      current.mouseHandlers.onMouseMove?.({
        ...point(317.5),
        nativeEvent: {
          clientX: 317.5,
          sourceCapabilities: {firesTouchEvents: true},
        },
      }),
    );
    expect(current.chartsTooltip).toBeNull();
  });
});
