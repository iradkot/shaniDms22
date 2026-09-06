import React, {forwardRef, useMemo} from 'react';
import {ScrollView, type ScrollViewProps} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import {ChartScrollContext} from './ChartScrollContext';

/** Native scrolling and chart touch observation share the same gesture stream. */
export const ChartScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function ChartScrollView(props, ref) {
    const scrollGesture = useMemo(
      () => Gesture.Native().disallowInterruption(false),
      [],
    );
    return (
      <ChartScrollContext.Provider value={scrollGesture}>
        <GestureDetector gesture={scrollGesture}>
          <ScrollView {...props} ref={ref} />
        </GestureDetector>
      </ChartScrollContext.Provider>
    );
  },
);
