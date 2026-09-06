import React, {forwardRef} from 'react';
import {ScrollView, type ScrollViewProps} from 'react-native';

export const ChartScrollView = forwardRef<ScrollView, ScrollViewProps>(
  function ChartScrollView(props, ref) {
    return <ScrollView {...props} ref={ref} />;
  },
);
