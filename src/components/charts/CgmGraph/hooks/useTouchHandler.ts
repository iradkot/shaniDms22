import {useCallback, useEffect, useRef, useState} from 'react';
import type {GestureResponderEvent} from 'react-native';

export type TouchPosition = {x: number; y: number};

export type TouchHandlerState = {
  isTouchActive: boolean;
  touchPosition: TouchPosition;
  handleTouchStart: (event: GestureResponderEvent) => void;
  handleTouchMove: (event: GestureResponderEvent) => void;
  handleTouchEnd: () => void;
};

/**
 * Tracks chart touch position without forcing a React render on every native touch-move event.
 *
 * Why:
 * - In React Native, `onTouchMove` can fire very frequently (often > 60 events/sec).
 * - If we call `setState` for every event, we force full component re-renders and re-run
 *   expensive work (chart selection, tooltip windowing, and large SVG tree reconciliation).
 *
 * What this hook does:
 * - Stores the latest touch position in a ref (cheap, no re-render).
 * - Commits that position to React state at most once per animation frame using
 *   `requestAnimationFrame`.
 * - Skips committing extremely small movements to reduce redundant renders.
 *
 * This keeps touch-driven UI responsive while significantly reducing JS/React churn.
 */
const useTouchHandler = (): TouchHandlerState => {
  const [isTouchActive, setIsTouchActive] = useState(false);
  const [touchPosition, setTouchPosition] = useState<TouchPosition>({x: 0, y: 0});

  // Latest raw position from touch events (does NOT trigger re-renders).
  const latestPositionRef = useRef<TouchPosition>({x: 0, y: 0});
  // Last state-committed position (used to skip redundant commits).
  const committedPositionRef = useRef<TouchPosition>({x: 0, y: 0});
  // Pending requestAnimationFrame id (null when none scheduled).
  const rafIdRef = useRef<number | null>(null);

  // Commit threshold in pixels. Values below this do not update React state.
  const minDeltaPx = 0.5;

  const cancelPendingFrame = useCallback(() => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const commitLatestPosition = useCallback(() => {
    rafIdRef.current = null;

    const next = latestPositionRef.current;
    const prev = committedPositionRef.current;

    const dx = Math.abs(next.x - prev.x);
    const dy = Math.abs(next.y - prev.y);

    if (dx < minDeltaPx && dy < minDeltaPx) {
      return;
    }

    committedPositionRef.current = next;
    setTouchPosition(next);
  }, []);

  const scheduleCommit = useCallback(() => {
    if (rafIdRef.current != null) {
      return;
    }
    rafIdRef.current = requestAnimationFrame(commitLatestPosition);
  }, [commitLatestPosition]);

  const handleTouchStart = useCallback((event: GestureResponderEvent) => {
    const {locationX, locationY} = event.nativeEvent;
    const pos = {x: locationX, y: locationY};

    latestPositionRef.current = pos;
    committedPositionRef.current = pos;

    cancelPendingFrame();
    setIsTouchActive(true);
    setTouchPosition(pos); // commit immediately for instant feedback
  }, [cancelPendingFrame]);

  const handleTouchMove = useCallback((event: GestureResponderEvent) => {
    const {locationX, locationY} = event.nativeEvent;
    latestPositionRef.current = {x: locationX, y: locationY};
    scheduleCommit();
  }, [scheduleCommit]);

  const handleTouchEnd = useCallback(() => {
    cancelPendingFrame();
    setIsTouchActive(false);
  }, [cancelPendingFrame]);

  // Cleanup if the component unmounts mid-gesture.
  useEffect(() => cancelPendingFrame, [cancelPendingFrame]);

  return {
    isTouchActive,
    touchPosition,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
  };
};

export default useTouchHandler;
