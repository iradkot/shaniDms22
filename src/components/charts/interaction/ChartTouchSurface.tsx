import React, {forwardRef, useContext, useEffect, useMemo, useRef} from 'react';
import {View} from 'react-native';
import {GestureDetector} from 'react-native-gesture-handler';
import {ChartScrollContext} from './ChartScrollContext';
import {createNativeChartTouchGesture} from './nativeChartTouchGesture';
import type {ChartTouchCallbacks, ChartTouchSurfaceProps} from './chartTouch.types';

export const ChartTouchSurface = forwardRef<View, ChartTouchSurfaceProps>(
  function ChartTouchSurface(
    {onTouchStart, onTouchMove, onTouchEnd, onTouchCancel, ...props},
    ref,
  ) {
    const scrollGesture = useContext(ChartScrollContext);
    const callbacks = useRef<ChartTouchCallbacks>({});
    callbacks.current = {onTouchStart, onTouchMove, onTouchEnd, onTouchCancel};
    const observer = useMemo(
      () =>
        scrollGesture
          ? createNativeChartTouchGesture(scrollGesture, () => callbacks.current)
          : null,
      [scrollGesture],
    );
    useEffect(() => {
      observer?.resume();
      return () => observer?.dispose();
    }, [observer]);

    if (!observer) {
      // Screens not yet using a paired ChartScrollView keep their existing
      // responder behavior until their scroll host is migrated explicitly.
      return <View {...props} {...callbacks.current} ref={ref} />;
    }
    return (
      <GestureDetector gesture={observer.gesture}>
        <View {...props} collapsable={false} ref={ref} />
      </GestureDetector>
    );
  },
);
