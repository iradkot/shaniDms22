import React from 'react';
import {ScrollView, View} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {
  GestureDetector,
  State,
  type GestureStateManager,
  type GestureTouchEvent,
  type ManualGesture,
} from 'react-native-gesture-handler';
import {ChartGestureRoot} from '../../../../src/components/charts/interaction/ChartGestureRoot';
import {ChartScrollView} from '../../../../src/components/charts/interaction/ChartScrollView';
import {ChartTouchSurface} from '../../../../src/components/charts/interaction/ChartTouchSurface';
import {ChartScrollView as WebScrollView} from '../../../../src/components/charts/interaction/ChartScrollView.web';
import {ChartTouchSurface as WebTouchSurface} from '../../../../src/components/charts/interaction/ChartTouchSurface.web';
import {useStackedChartsTouchTooltip} from '../../../../src/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts/hooks/useStackedChartsTouchTooltip';

jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  runOnUI: jest.fn(callback => callback),
  makeMutable: jest.fn(value => ({value})),
}));

describe('chart gesture adapters', () => {
  it('attaches the native gesture to the actual scroll view and pairs every surface', () => {
    const onTouchCancel = jest.fn();
    const onTouchMove = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ChartGestureRoot>
          <ChartScrollView testID="scroll">
            <ChartTouchSurface testID="glucose" onTouchMove={onTouchMove} />
            <ChartTouchSurface testID="insulin" onTouchCancel={onTouchCancel} />
          </ChartScrollView>
        </ChartGestureRoot>,
      );
    });
    const detectors = tree!.root.findAllByType(GestureDetector);
    expect(detectors).toHaveLength(3);
    const scroll = detectors[0]!.props.gesture;
    expect(scroll.handlerName).toBe('NativeViewGestureHandler');
    expect(scroll.config.disallowInterruption).toBe(false);
    expect(detectors[0]!.props.children.type).toBe(ScrollView);
    const [glucose, insulin] = detectors.slice(1).map(node => node.props.gesture);
    expect(glucose).not.toBe(insulin);
    expect(glucose.config.simultaneousWith).toEqual([scroll]);
    expect(insulin.config.simultaneousWith).toEqual([scroll]);
    for (const testID of ['glucose', 'insulin']) {
      const nativeView = tree!.root
        .findAllByType(View)
        .find(node => node.props.testID === testID)!;
      expect(nativeView.props.onTouchMove).toBeUndefined();
      expect(nativeView.props.onTouchCancel).toBeUndefined();
      expect(nativeView.props.collapsable).toBe(false);
    }
    act(() => tree!.unmount());
  });

  it('pairs a nested chart with its nearest scroll host', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <ChartGestureRoot>
          <ChartScrollView>
            <ChartScrollView>
              <ChartTouchSurface />
            </ChartScrollView>
          </ChartScrollView>
        </ChartGestureRoot>,
      );
    });
    const detectors = tree!.root.findAllByType(GestureDetector);
    expect(detectors[2]!.props.gesture.config.simultaneousWith).toEqual([
      detectors[1]!.props.gesture,
    ]);
    act(() => tree!.unmount());
  });

  it('preserves responder callbacks outside a paired scroll host', () => {
    const onTouchMove = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<ChartTouchSurface onTouchMove={onTouchMove} />);
    });
    expect(tree!.root.findAllByType(GestureDetector)).toHaveLength(0);
    expect(tree!.root.findByType(View).props.onTouchMove).toBe(onTouchMove);
    act(() => tree!.unmount());
  });

  it('leaves browser scrolling and touch callbacks in the browser adapters', () => {
    const onTouchMove = jest.fn();
    const onScroll = jest.fn();
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <WebScrollView onScroll={onScroll}>
          <WebTouchSurface onTouchMove={onTouchMove} />
        </WebScrollView>,
      );
    });
    expect(tree!.root.findAllByType(GestureDetector)).toHaveLength(0);
    expect(tree!.root.findByType(ScrollView).props.onScroll).toBe(onScroll);
    expect(tree!.root.findByType(WebTouchSurface).findByType(View).props.onTouchMove)
      .toBe(onTouchMove);
    act(() => tree!.unmount());
  });

  it('keeps the real chart selection alive through scroll, then tracks x until release', () => {
    jest.useFakeTimers();
    const onTouchSessionChange = jest.fn();
    let state: ReturnType<typeof useStackedChartsTouchTooltip>;
    function Harness() {
      state = useStackedChartsTouchTooltip({
        bgSamples: [],
        width: 240,
        margin: {left: 20, right: 20, top: 0, bottom: 0},
        xDomain: [new Date(0), new Date(1000)],
        onTouchSessionChange,
      });
      return (
        <ChartGestureRoot>
          <ChartScrollView>
            <ChartTouchSurface {...state.touchHandlers} />
          </ChartScrollView>
        </ChartGestureRoot>
      );
    }
    const manager: GestureStateManager = {
      handlerTag: 42,
      begin: jest.fn(),
      activate: jest.fn(),
      end: jest.fn(),
      fail: jest.fn(),
    };
    const nativeTouch = (
      x: number,
      absoluteX: number,
      y: number,
      numberOfTouches = 1,
    ): GestureTouchEvent => {
      const touch = {id: 1, x, y, absoluteX, absoluteY: y + 100};
      return {
        handlerTag: 42,
        state: State.BEGAN,
        eventType: 2,
        pointerType: 0,
        numberOfTouches,
        allTouches: [touch],
        changedTouches: [touch],
      };
    };
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness />);
    });
    const gesture = tree!.root.findAllByType(GestureDetector)[1]!.props
      .gesture as ManualGesture;
    act(() => {
      gesture.handlers.onTouchesDown?.(nativeTouch(80, 100, 70), manager);
    });
    expect(state!.chartsTooltip?.touchTimeMs).toBe(300);
    act(() => {
      gesture.handlers.onTouchesMove?.(nativeTouch(80, 100, -80), manager);
      jest.advanceTimersByTime(5000);
    });
    expect(state!.chartsTooltip?.touchTimeMs).toBe(300);
    expect(onTouchSessionChange).not.toHaveBeenCalledWith(null);
    act(() => {
      // Local coordinates can move with scrolling; the initial page origin
      // remains the stable anchor used by the production inspector hook.
      gesture.handlers.onTouchesMove?.(nativeTouch(900, 160, -100), manager);
    });
    expect(state!.chartsTooltip?.touchTimeMs).toBe(600);
    expect(tree!.root.findAllByType(GestureDetector)[1]!.props.gesture).toBe(
      gesture,
    );
    expect(manager.activate).not.toHaveBeenCalled();
    act(() => {
      gesture.handlers.onTouchesUp?.(nativeTouch(900, 160, -100, 0), manager);
    });
    expect(onTouchSessionChange).toHaveBeenLastCalledWith(null);
    expect(state!.chartsTooltip?.touchTimeMs).toBe(600);
    act(() => jest.advanceTimersByTime(4001));
    expect(state!.chartsTooltip).toBeNull();
    act(() => tree!.unmount());
    jest.useRealTimers();
  });
});
