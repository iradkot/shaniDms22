import {
  Gesture,
  type GestureTouchEvent,
  type NativeGesture,
  type TouchData,
} from 'react-native-gesture-handler';
import {makeMutable, runOnJS} from 'react-native-reanimated';
import type {
  ChartTouchCallbacks,
  ChartTouchEvent,
  ChartTouchPoint,
} from './chartTouch.types';

const coordinates = (touch: TouchData): ChartTouchPoint => ({
  identifier: touch.id,
  pageX: touch.absoluteX,
  pageY: touch.absoluteY,
  locationX: touch.x,
  locationY: touch.y,
});

function touchEvent(event: GestureTouchEvent): ChartTouchEvent {
  const touches = event.allTouches.map(coordinates);
  const changedTouches = event.changedTouches.map(coordinates);
  return {
    nativeEvent: {
      ...(touches[0] ?? changedTouches[0]),
      touches,
      changedTouches,
    },
  };
}

type TouchPhase = 'start' | 'move' | 'end' | 'cancel';

/** Observe touches in BEGAN while the paired native ScrollView owns scrolling. */
export function createNativeChartTouchGesture(
  scrollGesture: NativeGesture,
  getCallbacks: () => ChartTouchCallbacks,
) {
  const contact = makeMutable({active: false, sequence: 0});
  let mounted = true;
  let active = false;
  let sequence = 0;
  let lastEvent: ChartTouchEvent | undefined;

  const cancel = () => {
    if (active && lastEvent) {
      active = false;
      getCallbacks().onTouchCancel?.(lastEvent);
    }
  };

  const deliver = (
    phase: TouchPhase,
    contactSequence: number,
    event?: GestureTouchEvent,
  ) => {
    if (!mounted || contactSequence < sequence) {
      return;
    }
    if (phase === 'start' && event) {
      sequence = contactSequence;
      active = true;
      lastEvent = touchEvent(event);
      getCallbacks().onTouchStart?.(lastEvent);
      return;
    }
    if (!active || contactSequence !== sequence) {
      return;
    }
    if (event) {
      lastEvent = touchEvent(event);
    }
    if (phase === 'cancel') {
      cancel();
    } else if (phase === 'end' && lastEvent) {
      active = false;
      getCallbacks().onTouchEnd?.(lastEvent);
    } else if (phase === 'move' && lastEvent) {
      getCallbacks().onTouchMove?.(lastEvent);
    }
  };

  const gesture = Gesture.Manual()
    .shouldCancelWhenOutside(false)
    .cancelsTouchesInView(false)
    .simultaneousWithExternalGesture(scrollGesture)
    .onTouchesDown((event, manager) => {
      'worklet';
      const current = contact.value;
      if (event.numberOfTouches !== 1) {
        contact.value = {...current, active: false};
        if (current.active) {
          runOnJS(deliver)('cancel', current.sequence, event);
        }
        manager.fail();
        return;
      }
      const next = {active: true, sequence: current.sequence + 1};
      contact.value = next;
      runOnJS(deliver)('start', next.sequence, event);
    })
    .onTouchesMove((event, manager) => {
      'worklet';
      const current = contact.value;
      if (!current.active) {
        return;
      }
      if (event.numberOfTouches !== 1) {
        contact.value = {...current, active: false};
        runOnJS(deliver)('cancel', current.sequence, event);
        manager.fail();
        return;
      }
      runOnJS(deliver)('move', current.sequence, event);
    })
    .onTouchesUp((event, manager) => {
      'worklet';
      const current = contact.value;
      if (!current.active || event.numberOfTouches !== 0) {
        return;
      }
      // Finish in this UI turn. A JS→UI round trip could end a later contact
      // using the same native handler tag while the JS thread is busy.
      contact.value = {...current, active: false};
      runOnJS(deliver)('end', current.sequence, event);
      manager.end();
    })
    .onTouchesCancelled((event, manager) => {
      'worklet';
      const current = contact.value;
      if (!current.active) {
        return;
      }
      contact.value = {...current, active: false};
      runOnJS(deliver)('cancel', current.sequence, event);
      manager.fail();
    })
    .onFinalize(() => {
      'worklet';
      const current = contact.value;
      if (current.active) {
        contact.value = {...current, active: false};
        runOnJS(deliver)('cancel', current.sequence);
      }
    });

  return {
    gesture,
    resume: () => {
      mounted = true;
    },
    dispose: () => {
      mounted = false;
      cancel();
      // GestureDetector owns native handler removal. Do not send a deferred
      // state mutation to a tag that may already belong to a remounted view.
    },
  };
}
