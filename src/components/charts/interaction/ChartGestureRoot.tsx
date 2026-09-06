import React from 'react';
import type {ViewProps} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';

/** Android modals require their own native gesture root. */
export const ChartGestureRoot = (props: ViewProps) => (
  <GestureHandlerRootView {...props} />
);
