import React, {forwardRef} from 'react';
import {View} from 'react-native';
import type {ChartTouchSurfaceProps} from './chartTouch.types';

/** The browser keeps its native vertical pan and ordinary touch/mouse events. */
export const ChartTouchSurface = forwardRef<View, ChartTouchSurfaceProps>(
  function ChartTouchSurface(props, ref) {
    return <View {...props} ref={ref} />;
  },
);
