import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import {State, type PanGesture} from 'react-native-gesture-handler';
import {getByGestureTestId} from 'react-native-gesture-handler/jest-utils';
import * as Reanimated from 'react-native-reanimated';
import {DailyOverviewReorderList} from 'app/product/dailyOverview/DailyOverviewReorderList';

const ids = ['ranges', 'average', 'metrics', 'insulin', 'coverage'];
const items = ids.map(id => ({
  id,
  label: id,
  preview: <Text>{id} preview</Text>,
}));

function event(pan: PanGesture, y: number) {
  return {
    state: State.ACTIVE,
    oldState: State.BEGAN,
    handlerTag: pan.handlerTag,
    numberOfPointers: 1,
    pointerType: 0,
    x: 20,
    y,
    absoluteX: 20,
    absoluteY: y,
    translationX: 0,
    translationY: 0,
    velocityX: 0,
    velocityY: 0,
  };
}

describe('daily overview reorder controls', () => {
  beforeEach(() => {
    jest
      .spyOn(Reanimated, 'measure')
      .mockReturnValue({
        x: 0,
        y: 0,
        pageX: 0,
        pageY: 0,
        width: 320,
        height: 390,
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('publishes accessible moves and exposes disabled boundary controls', async () => {
    const onReorder = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DailyOverviewReorderList
          items={items}
          locale="he"
          onReorder={onReorder}
        />,
      );
    });
    const buttons = tree!.root.findAllByType(Pressable);
    expect(
      buttons.find(
        button => button.props.testID === 'daily-overview-move-up-ranges',
      )?.props.disabled,
    ).toBe(true);
    expect(
      buttons.find(
        button => button.props.testID === 'daily-overview-move-down-coverage',
      )?.props.disabled,
    ).toBe(true);
    act(() =>
      buttons
        .find(
          button => button.props.testID === 'daily-overview-move-up-average',
        )
        ?.props.onPress(),
    );
    expect(onReorder).toHaveBeenCalledWith([
      'average',
      'ranges',
      'metrics',
      'insulin',
      'coverage',
    ]);
    act(() => tree!.unmount());
  });

  test('does not publish a cancelled drag, even after provisional slot changes', async () => {
    const onReorder = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DailyOverviewReorderList
          items={items}
          locale="en"
          onReorder={onReorder}
        />,
      );
    });
    const pan = getByGestureTestId('daily-overview-pan-ranges') as PanGesture;
    act(() => {
      pan.handlers.onStart?.(event(pan, 40));
      pan.handlers.onUpdate?.(event(pan, 300));
      expect(onReorder).not.toHaveBeenCalled();
      pan.handlers.onEnd?.({...event(pan, 300), state: State.CANCELLED}, false);
      pan.handlers.onFinalize?.(
        {...event(pan, 300), state: State.CANCELLED},
        false,
      );
    });
    expect(onReorder).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  test('a stationary finger at the bottom autoscrolls the first card to the last slot', async () => {
    const onReorder = jest.fn();
    const scroll = jest.spyOn(Reanimated, 'scrollTo');
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DailyOverviewReorderList
          items={items}
          locale="en"
          onReorder={onReorder}
        />,
      );
    });
    const pan = getByGestureTestId('daily-overview-pan-ranges') as PanGesture;
    const calls = jest.mocked(Reanimated.useFrameCallback).mock.calls;
    const frame = calls[calls.length - 1]?.[0];
    expect(frame).toBeDefined();
    act(() => {
      pan.handlers.onStart?.(event(pan, 40));
      pan.handlers.onUpdate?.(event(pan, 385));
      for (let index = 0; index < 80; index += 1) {
        frame?.({
          timestamp: index * 16,
          timeSinceFirstFrame: index * 16,
          timeSincePreviousFrame: 16,
        });
      }
      expect(onReorder).not.toHaveBeenCalled();
      pan.handlers.onEnd?.({...event(pan, 385), state: State.END}, true);
      pan.handlers.onFinalize?.({...event(pan, 385), state: State.END}, true);
    });
    expect(scroll.mock.calls.some(call => call[2] > 0)).toBe(true);
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder).toHaveBeenCalledWith([
      'average',
      'metrics',
      'insulin',
      'coverage',
      'ranges',
    ]);
    act(() => tree!.unmount());
  });
});
