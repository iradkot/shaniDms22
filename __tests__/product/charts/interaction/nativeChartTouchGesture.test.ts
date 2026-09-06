import {
  Gesture,
  State,
  type GestureStateManager,
  type GestureTouchEvent,
  type TouchData,
} from 'react-native-gesture-handler';
import {runOnJS, runOnUI} from 'react-native-reanimated';
import {createNativeChartTouchGesture} from '../../../../src/components/charts/interaction/nativeChartTouchGesture';

jest.mock('react-native-reanimated', () => ({
  ...require('react-native-reanimated/mock'),
  runOnUI: jest.fn(callback => callback),
  runOnJS: jest.fn(callback => callback),
  makeMutable: jest.fn(value => ({value})),
}));

const point = (x = 80, y = 60): TouchData => ({
  id: 1,
  x,
  y,
  absoluteX: x + 20,
  absoluteY: y + 100,
});

const event = (
  allTouches: TouchData[] = [point()],
  changedTouches = allTouches,
  numberOfTouches = allTouches.length,
): GestureTouchEvent => ({
  handlerTag: 42,
  numberOfTouches,
  state: State.BEGAN,
  eventType: 1,
  pointerType: 0,
  allTouches,
  changedTouches,
});

function fixture() {
  const callbacks = {
    onTouchStart: jest.fn(),
    onTouchMove: jest.fn(),
    onTouchEnd: jest.fn(),
    onTouchCancel: jest.fn(),
  };
  const manager: GestureStateManager = {
    handlerTag: 42,
    begin: jest.fn(),
    activate: jest.fn(),
    end: jest.fn(),
    fail: jest.fn(),
  };
  const scrollGesture = Gesture.Native();
  const observer = createNativeChartTouchGesture(
    scrollGesture,
    () => callbacks,
  );
  return {...observer, callbacks, manager, scrollGesture};
}

describe('native chart touch observation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(runOnJS)
      .mockImplementation(callback => callback as (...args: unknown[]) => void);
  });

  it('pairs with scrolling without activating or capturing the pan', () => {
    const {gesture, callbacks, manager, scrollGesture} = fixture();
    expect(gesture.handlerName).toBe('ManualGestureHandler');
    expect(gesture.config).toMatchObject({
      shouldCancelWhenOutside: false,
      cancelsTouchesInView: false,
      simultaneousWith: [scrollGesture],
    });
    expect(gesture.config.runOnJS).not.toBe(true);
    expect(gesture.handlers.isWorklet.filter(value => value === false)).toEqual(
      [],
    );
    expect(gesture.config.requireToFail).toBeUndefined();
    expect(gesture.config.blocksHandlers).toBeUndefined();
    gesture.handlers.onTouchesDown?.(event(), manager);
    // Continue observing a diagonal movement as the scroll container pans.
    gesture.handlers.onTouchesMove?.(event([point(100, -200)]), manager);
    expect(callbacks.onTouchMove).toHaveBeenCalledWith({
      nativeEvent: {
        identifier: 1,
        locationX: 100,
        locationY: -200,
        pageX: 120,
        pageY: -100,
        touches: [expect.objectContaining({pageX: 120, pageY: -100})],
        changedTouches: [expect.objectContaining({identifier: 1})],
      },
    });
    expect(manager.activate).not.toHaveBeenCalled();
    expect(manager.begin).not.toHaveBeenCalled();
    expect(callbacks.onTouchCancel).not.toHaveBeenCalled();
    expect(manager.end).not.toHaveBeenCalled();
    expect(manager.fail).not.toHaveBeenCalled();
  });

  it('does not flood the JS thread with vertical scrolling coordinates', () => {
    const {gesture, manager} = fixture();
    gesture.handlers.onTouchesDown?.(event(), manager);
    jest.mocked(runOnJS).mockClear();
    for (let sample = 0; sample < 120; sample++) {
      gesture.handlers.onTouchesMove?.(
        event([point(80, 60 - sample)]),
        manager,
      );
    }
    expect(runOnJS).not.toHaveBeenCalled();
  });

  it('keeps one pending move when JS is busy and then delivers the newest position', () => {
    const jsQueue: Array<() => void> = [];
    jest.mocked(runOnJS).mockImplementation(callback => (...args) => {
      jsQueue.push(() => (callback as (...values: unknown[]) => void)(...args));
    });
    const {gesture, manager, callbacks} = fixture();
    gesture.handlers.onTouchesDown?.(event(), manager);
    jsQueue.shift()?.();
    for (let sample = 1; sample <= 120; sample++) {
      gesture.handlers.onTouchesMove?.(
        event([point(80 + sample, 60 - sample)]),
        manager,
      );
    }
    expect(jsQueue).toHaveLength(1);
    while (jsQueue.length) {jsQueue.shift()?.();}
    expect(callbacks.onTouchMove).toHaveBeenCalledTimes(2);
    expect(callbacks.onTouchMove).toHaveBeenLastCalledWith({
      nativeEvent: expect.objectContaining({pageX: 220}),
    });
  });

  it('ends only after the finger lifts and ignores native terminal cancellation', () => {
    const {gesture, callbacks, manager, dispose} = fixture();
    gesture.handlers.onTouchesDown?.(event(), manager);
    gesture.handlers.onTouchesUp?.(
      event([point(140, 90)], [point(140, 90)], 0),
      manager,
    );
    gesture.handlers.onTouchesCancelled?.(event([]), manager);
    dispose();
    expect(callbacks.onTouchEnd).toHaveBeenCalledWith({
      nativeEvent: expect.objectContaining({
        locationX: 140,
        pageX: 160,
        touches: [expect.objectContaining({locationX: 140})],
        changedTouches: [expect.objectContaining({locationX: 140})],
      }),
    });
    expect(manager.end).toHaveBeenCalledTimes(1);
    expect(manager.fail).not.toHaveBeenCalled();
    expect(callbacks.onTouchCancel).not.toHaveBeenCalled();
  });

  it('forwards genuine native cancellation once and stops further moves', () => {
    const {gesture, callbacks, manager, dispose} = fixture();
    gesture.handlers.onTouchesDown?.(event(), manager);
    gesture.handlers.onTouchesCancelled?.(event([]), manager);
    gesture.handlers.onTouchesCancelled?.(event([]), manager);
    gesture.handlers.onTouchesMove?.(event(), manager);
    dispose();
    expect(callbacks.onTouchCancel).toHaveBeenCalledTimes(1);
    expect(callbacks.onTouchMove).not.toHaveBeenCalled();
    expect(callbacks.onTouchEnd).not.toHaveBeenCalled();
    expect(manager.fail).toHaveBeenCalledTimes(1);
  });

  it('fails observation for a second finger so pinch gestures remain available', () => {
    const {gesture, callbacks, manager} = fixture();
    gesture.handlers.onTouchesDown?.(event(), manager);
    const multiple = event([point(), {...point(100), id: 2}]);
    gesture.handlers.onTouchesDown?.(multiple, manager);
    gesture.handlers.onTouchesMove?.(multiple, manager);
    gesture.handlers.onTouchesUp?.(event([point()], [point()], 0), manager);
    expect(callbacks.onTouchStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onTouchCancel).toHaveBeenCalledTimes(1);
    expect(callbacks.onTouchMove).not.toHaveBeenCalled();
    expect(callbacks.onTouchEnd).not.toHaveBeenCalled();
    expect(manager.fail).toHaveBeenCalledTimes(1);
    expect(manager.activate).not.toHaveBeenCalled();
    // A later gesture can start normally after the native handler resets.
    gesture.handlers.onTouchesDown?.(event(), manager);
    expect(callbacks.onTouchStart).toHaveBeenCalledTimes(2);
  });

  it('does not start an inspector when the first event already has two fingers', () => {
    const {gesture, callbacks, manager} = fixture();
    gesture.handlers.onTouchesDown?.(
      event([point(), {...point(), id: 2}]),
      manager,
    );
    expect(callbacks.onTouchStart).not.toHaveBeenCalled();
    expect(manager.fail).toHaveBeenCalledTimes(1);
  });

  it('releases an active observation on disposal, once', () => {
    const {gesture, callbacks, manager, dispose} = fixture();
    gesture.handlers.onTouchesDown?.(event(), manager);
    dispose();
    dispose();
    expect(callbacks.onTouchCancel).toHaveBeenCalledTimes(1);
    expect(runOnUI).not.toHaveBeenCalled();
  });

  it('reads current callbacks without replacing the native gesture', () => {
    let onTouchMove = jest.fn();
    const observer = createNativeChartTouchGesture(Gesture.Native(), () => ({
      onTouchMove,
    }));
    const {manager} = fixture();
    observer.gesture.handlers.onTouchesDown?.(event(), manager);
    const previous = onTouchMove;
    onTouchMove = jest.fn();
    observer.gesture.handlers.onTouchesMove?.(event([point(100)]), manager);
    expect(previous).not.toHaveBeenCalled();
    expect(onTouchMove).toHaveBeenCalledTimes(1);
  });

  it('ends synchronously in the worklet without a JS to UI round trip', () => {
    const {manager} = fixture();
    const {gesture} = createNativeChartTouchGesture(
      Gesture.Native(),
      () => ({}),
    );
    gesture.handlers.onTouchesDown?.(event(), manager);
    gesture.handlers.onTouchesUp?.(event([point()], [point()], 0), manager);
    expect(runOnUI).not.toHaveBeenCalled();
    expect(manager.end).toHaveBeenCalledTimes(1);
  });

  it('ends the first native contact before delayed JS callbacks can affect a second contact', () => {
    const jsQueue: Array<() => void> = [];
    jest.mocked(runOnJS).mockImplementation(callback => (...args) => {
      jsQueue.push(() => (callback as (...values: unknown[]) => void)(...args));
    });
    const {gesture, callbacks, manager} = fixture();
    gesture.handlers.onTouchesDown?.(event(), manager);
    gesture.handlers.onTouchesUp?.(event([point()], [point()], 0), manager);
    // Native gesture lifecycle must finish even while React's JS thread is busy.
    expect(manager.end).toHaveBeenCalledTimes(1);
    expect(callbacks.onTouchStart).not.toHaveBeenCalled();
    // Native END finalizes in the same UI turn, before the next DOWN.
    const finalize = gesture.handlers.onFinalize as (() => void) | undefined;
    finalize?.();
    gesture.handlers.onTouchesDown?.(event([point(120)]), manager);
    gesture.handlers.onTouchesMove?.(event([point(160)]), manager);
    for (const deliver of jsQueue) {
      deliver();
    }
    expect(callbacks.onTouchStart).toHaveBeenCalledTimes(2);
    expect(callbacks.onTouchEnd).toHaveBeenCalledTimes(1);
    expect(callbacks.onTouchCancel).not.toHaveBeenCalled();
    expect(callbacks.onTouchMove).toHaveBeenLastCalledWith({
      nativeEvent: expect.objectContaining({pageX: 180}),
    });
    expect(manager.end).toHaveBeenCalledTimes(1);
  });

  it('ignores queued UI deliveries after the surface unmounts', () => {
    const jsQueue: Array<() => void> = [];
    jest.mocked(runOnJS).mockImplementation(callback => (...args) => {
      jsQueue.push(() => (callback as (...values: unknown[]) => void)(...args));
    });
    const {gesture, callbacks, manager, dispose} = fixture();
    gesture.handlers.onTouchesDown?.(event(), manager);
    gesture.handlers.onTouchesMove?.(event([point(120)]), manager);
    dispose();
    for (const deliver of jsQueue) {
      deliver();
    }
    expect(callbacks.onTouchStart).not.toHaveBeenCalled();
    expect(callbacks.onTouchMove).not.toHaveBeenCalled();
    expect(runOnUI).not.toHaveBeenCalled();
  });

  it('can resume after React repeats effect setup and cleanup', () => {
    const {gesture, callbacks, manager, dispose, resume} = fixture();
    dispose();
    resume();
    gesture.handlers.onTouchesDown?.(event(), manager);
    gesture.handlers.onTouchesMove?.(event([point(120)]), manager);
    expect(callbacks.onTouchStart).toHaveBeenCalledTimes(1);
    expect(callbacks.onTouchMove).toHaveBeenCalledTimes(1);
  });
});
