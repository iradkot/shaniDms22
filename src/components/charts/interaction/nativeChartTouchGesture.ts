import {
  Gesture,
  type GestureTouchEvent,
  type NativeGesture,
  type TouchData,
} from 'react-native-gesture-handler';
import {makeMutable, runOnJS, runOnUI} from 'react-native-reanimated';
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
type NativeContact = {
  active: boolean;
  sequence: number;
  sentX: number;
  moveInFlight: boolean;
  pendingMove: GestureTouchEvent | null;
};
const MIN_MOVE_PX = 0.5;

/** Observe touches in BEGAN while the paired native ScrollView owns scrolling. */
export function createNativeChartTouchGesture(
  scrollGesture: NativeGesture,
  getCallbacks: () => ChartTouchCallbacks,
) {
  const contact = makeMutable<NativeContact>({
    active: false,
    sequence: 0,
    sentX: 0,
    moveInFlight: false,
    pendingMove: null,
  });
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
      // A busy JS thread may have skipped intermediate moves. Preserve the
      // release position before ending the shared inspection session.
      const finalPoint =
        lastEvent.nativeEvent.changedTouches?.[0] ??
        lastEvent.nativeEvent.touches?.[0];
      if (finalPoint) {
        getCallbacks().onTouchMove?.({
          nativeEvent: {
            ...finalPoint,
            touches: [finalPoint],
            changedTouches: [finalPoint],
          },
        });
      }
      active = false;
      getCallbacks().onTouchEnd?.(lastEvent);
    } else if (phase === 'move' && lastEvent) {
      getCallbacks().onTouchMove?.(lastEvent);
    }
  };

  // Define the JS receiver before the worklet captures it. Babel snapshots
  // worklet closures at creation rather than resolving later lexical bindings.
  const deliverMove = (contactSequence: number, event: GestureTouchEvent) => {
    if (!mounted) {return;}
    deliver('move', contactSequence, event);
    runOnUI(acknowledgeMove)(contactSequence);
  };

  const acknowledgeMove = (contactSequence: number) => {
    'worklet';
    const current = contact.value;
    if (!current.active || current.sequence !== contactSequence) {return;}
    const pending = current.pendingMove;
    const x = pending?.allTouches[0]?.absoluteX;
    if (
      pending &&
      x !== undefined &&
      Math.abs(x - current.sentX) >= MIN_MOVE_PX
    ) {
      contact.value = {...current, pendingMove: null, sentX: x};
      runOnJS(deliverMove)(contactSequence, pending);
    } else {
      contact.value = {...current, moveInFlight: false, pendingMove: null};
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
      const next: NativeContact = {
        active: true,
        sequence: current.sequence + 1,
        sentX: event.allTouches[0]?.absoluteX ?? 0,
        moveInFlight: false,
        pendingMove: null,
      };
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
      const x = event.allTouches[0]?.absoluteX;
      if (x === undefined) {return;}
      if (current.moveInFlight) {
        contact.value = {...current, pendingMove: event};
      } else if (Math.abs(x - current.sentX) >= MIN_MOVE_PX) {
        contact.value = {...current, moveInFlight: true, sentX: x};
        runOnJS(deliverMove)(current.sequence, event);
      }
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
