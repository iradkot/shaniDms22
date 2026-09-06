import type {ViewProps} from 'react-native';

export interface ChartTouchPoint {
  readonly identifier?: number | string;
  readonly pageX?: number;
  readonly pageY?: number;
  readonly clientX?: number;
  readonly locationX?: number;
  readonly locationY?: number;
}

/** Coordinates shared by native gesture observations and browser touch events. */
export interface ChartTouchEvent {
  readonly nativeEvent: ChartTouchPoint & {
    readonly touches?: ArrayLike<ChartTouchPoint>;
    readonly changedTouches?: ArrayLike<ChartTouchPoint>;
  };
  readonly currentTarget?: unknown;
}

export interface ChartTouchCallbacks {
  readonly onTouchStart?: ((event: ChartTouchEvent) => void) | undefined;
  readonly onTouchMove?: ((event: ChartTouchEvent) => void) | undefined;
  readonly onTouchEnd?: ((event: ChartTouchEvent) => void) | undefined;
  readonly onTouchCancel?: ((event: ChartTouchEvent) => void) | undefined;
}

export type ChartTouchSurfaceProps = Omit<
  ViewProps,
  keyof ChartTouchCallbacks
> &
  ChartTouchCallbacks;
