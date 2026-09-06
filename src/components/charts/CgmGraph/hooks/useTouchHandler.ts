import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {GestureResponderEvent} from 'react-native';
import {createLatestFrame} from 'app/utils/latestFrame';

export type TouchPosition = {x: number; y: number};
export type TouchHandlerState = {
  isTouchActive: boolean;
  touchPosition: TouchPosition;
  handleTouchStart: (event: GestureResponderEvent) => void;
  handleTouchMove: (event: GestureResponderEvent) => void;
  handleTouchEnd: () => void;
};

/** Standalone charts use the same latest-input frame policy as stacked charts. */
const useTouchHandler = (): TouchHandlerState => {
  const [isTouchActive, setIsTouchActive] = useState(false);
  const [touchPosition, setTouchPosition] = useState<TouchPosition>({
    x: 0,
    y: 0,
  });
  const committed = useRef(touchPosition);
  const frame = useMemo(
    () =>
      createLatestFrame<TouchPosition>(next => {
        const previous = committed.current;
        if (
          Math.abs(next.x - previous.x) < 0.5 &&
          Math.abs(next.y - previous.y) < 0.5
        )
          {return;}
        committed.current = next;
        setTouchPosition(next);
      }),
    [],
  );

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      const {locationX: x, locationY: y} = event.nativeEvent;
      frame.cancel();
      committed.current = {x, y};
      setIsTouchActive(true);
      setTouchPosition(committed.current);
    },
    [frame],
  );

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      const {locationX: x, locationY: y} = event.nativeEvent;
      frame.schedule({x, y});
    },
    [frame],
  );

  const handleTouchEnd = useCallback(() => {
    frame.flush();
    setIsTouchActive(false);
  }, [frame]);

  useEffect(() => frame.cancel, [frame]);
  return {
    isTouchActive,
    touchPosition,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};

export default useTouchHandler;
