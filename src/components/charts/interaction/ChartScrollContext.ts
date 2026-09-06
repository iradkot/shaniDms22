import {createContext} from 'react';
import type {NativeGesture} from 'react-native-gesture-handler';

/** Each chart observes the nearest scroll container without claiming its pan. */
export const ChartScrollContext = createContext<NativeGesture | null>(null);
