import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Platform, type GestureResponderEvent} from 'react-native';
import * as d3 from 'd3';

import type {ChartMargin} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import type {CGMGraphExternalTooltipPayload} from 'app/components/charts/CgmGraph/CgmGraph';
import {buildExternalTooltipPayloadFromLocationX} from 'app/components/charts/CgmGraph/utils/externalTooltipTouch.utils';
import type {BgSample} from 'app/types/day_bgs.types';
import type {StackedChartsTouchSession} from '../StackedHomeCharts.types';

type UseStackedChartsTouchTooltipParams = {
  bgSamples: BgSample[];
  width: number;
  margin: ChartMargin;
  xDomain?: [Date, Date] | null | undefined;
  autoHideMs?: number;
  onTouchSessionChange?:
    | ((session: StackedChartsTouchSession | null) => void)
    | undefined;
};

// Structural contracts also work on native without importing DOM types.
type ChartSurface = {
  getBoundingClientRect?: () => {left: number; width?: number};
};
type ChartMouseEvent = {
  readonly nativeEvent: {
    readonly clientX: number;
    readonly sourceCapabilities?: {readonly firesTouchEvents?: boolean};
  };
  readonly currentTarget: ChartSurface;
  readonly preventDefault?: () => void;
};
type TouchPoint = {
  pageX?: number | undefined;
  pageY?: number | undefined;
  clientX?: number | undefined;
  locationX?: number | undefined;
};
type ChartTouchEvent = {
  nativeEvent: TouchPoint & {
    touches?: ArrayLike<TouchPoint>;
    changedTouches?: ArrayLike<TouchPoint>;
  };
  currentTarget?: ChartSurface;
};
type ActiveTouch = {
  pageOriginX: number | null;
  startPageX: number | null;
  startPageY: number | null;
  scale: number;
  horizontal: boolean;
};

const MOVE_THRESHOLD_PX = 8;
const SYNTHETIC_MOUSE_DELAY_MS = 800;
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

function getTouchPoint(event: ChartTouchEvent): TouchPoint {
  const native = event.nativeEvent;
  const touch = native.touches?.[0] ?? native.changedTouches?.[0];
  return {
    pageX: touch?.pageX ?? native.pageX,
    pageY: touch?.pageY ?? native.pageY,
    clientX: touch?.clientX ?? native.clientX,
    locationX: native.locationX ?? touch?.locationX,
  };
}

export function useStackedChartsTouchTooltip({
  bgSamples,
  width,
  margin,
  xDomain,
  autoHideMs = 4000,
  onTouchSessionChange,
}: UseStackedChartsTouchTooltipParams) {
  const [chartsTooltip, setChartsTooltip] =
    useState<CGMGraphExternalTooltipPayload | null>(null);
  const lastPayloadRef = useRef<CGMGraphExternalTooltipPayload | null>(null);
  const activeTouchRef = useRef<ActiveTouch | null>(null);
  const ignoreMouseUntilRef = useRef(0);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionCallbackRef = useRef(onTouchSessionChange);
  sessionCallbackRef.current = onTouchSessionChange;

  const clearTooltipTimer = useCallback(() => {
    if (tooltipTimerRef.current != null) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  const releaseTouchSession = useCallback(() => {
    activeTouchRef.current = null;
    sessionCallbackRef.current?.(null);
  }, []);

  const clearTooltipState = useCallback(() => {
    lastPayloadRef.current = null;
    setChartsTooltip(null);
  }, []);

  const scheduleTooltipAutoHide = useCallback(() => {
    clearTooltipTimer();
    tooltipTimerRef.current = setTimeout(() => {
      clearTooltipState();
      tooltipTimerRef.current = null;
    }, autoHideMs);
  }, [autoHideMs, clearTooltipState, clearTooltipTimer]);

  const handleTooltipChange = useCallback(
    (payload: CGMGraphExternalTooltipPayload | null) => {
      clearTooltipTimer();
      lastPayloadRef.current = payload;
      setChartsTooltip(payload);
      if (!payload) {
        releaseTouchSession();
      } else if (payload.autoHide) {
        scheduleTooltipAutoHide();
      }
    },
    [clearTooltipTimer, releaseTouchSession, scheduleTooltipAutoHide],
  );

  const extent = useMemo(() => d3.extent(bgSamples, s => s.date), [bgSamples]);
  const domainStartMs = xDomain?.[0].getTime() ?? extent[0] ?? 0;
  const domainEndMs = xDomain?.[1].getTime() ?? extent[1] ?? 0;
  const plotWidth = Math.max(1, width - margin.left - margin.right);
  const xScale = useMemo(
    () =>
      d3
        .scaleTime()
        .domain([new Date(domainStartMs), new Date(domainEndMs)])
        .range([0, plotWidth]),
    [domainStartMs, domainEndMs, plotWidth],
  );

  const buildTooltipPayloadFromRawX = useCallback(
    (rawX: number): CGMGraphExternalTooltipPayload | null =>
      buildExternalTooltipPayloadFromLocationX({
        rawX,
        plotMarginLeft: margin.left,
        plotWidth,
        xScale,
      }),
    [margin.left, plotWidth, xScale],
  );

  const handleTouchEnd = useCallback(() => {
    // Visibility is independent of gesture ownership: a tap stays readable,
    // but must never keep the page in an active chart-touch session.
    ignoreMouseUntilRef.current = Date.now() + SYNTHETIC_MOUSE_DELAY_MS;
    releaseTouchSession();
    if (lastPayloadRef.current) {
      scheduleTooltipAutoHide();
    }
  }, [releaseTouchSession, scheduleTooltipAutoHide]);

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      const active = activeTouchRef.current;
      if (!active) {
        return;
      }
      const evt = event as unknown as ChartTouchEvent;
      if ((evt.nativeEvent.touches?.length ?? 1) !== 1) {
        handleTouchEnd();
        return;
      }
      const point = getTouchPoint(evt);
      if (!isFiniteNumber(point.pageX) || active.pageOriginX == null) {
        return;
      }
      if (!active.horizontal && active.startPageX != null) {
        const dx = Math.abs(point.pageX - active.startPageX);
        const dy =
          isFiniteNumber(point.pageY) && active.startPageY != null
            ? Math.abs(point.pageY - active.startPageY)
            : 0;
        if (dy >= MOVE_THRESHOLD_PX && dy > dx) {
          // Let vertical page scrolling finish without scrubbing the time.
          handleTouchEnd();
          return;
        }
        if (dx < MOVE_THRESHOLD_PX) {
          return;
        }
        active.horizontal = true;
      }
      const payload = buildTooltipPayloadFromRawX(
        (point.pageX - active.pageOriginX) * active.scale,
      );
      if (payload) {
        handleTooltipChange(payload);
      }
    },
    [buildTooltipPayloadFromRawX, handleTooltipChange, handleTouchEnd],
  );

  const pageTouchSession = useMemo<StackedChartsTouchSession>(
    () => ({
      handlePageTouchMove: handleTouchMove,
      handlePageTouchEnd: handleTouchEnd,
      handlePageTouchCancel: handleTouchEnd,
    }),
    [handleTouchEnd, handleTouchMove],
  );

  const handleTouchStart = useCallback(
    (event: GestureResponderEvent) => {
      ignoreMouseUntilRef.current = Date.now() + SYNTHETIC_MOUSE_DELAY_MS;
      const evt = event as unknown as ChartTouchEvent;
      if ((evt.nativeEvent.touches?.length ?? 1) !== 1) {
        handleTouchEnd();
        return;
      }
      const point = getTouchPoint(evt);
      const rect = evt.currentTarget?.getBoundingClientRect?.();
      const scale =
        rect && isFiniteNumber(rect.width) && rect.width > 0
          ? width / rect.width
          : 1;
      // On web locationX is relative to the SVG child under the finger.
      // Native visual children use pointerEvents="none" so the surface is
      // the event target and its initial locationX provides a stable origin.
      const surfaceX =
        rect && isFiniteNumber(point.clientX)
          ? point.clientX - rect.left
          : point.locationX;
      if (!isFiniteNumber(surfaceX)) {
        releaseTouchSession();
        return;
      }
      const payload = buildTooltipPayloadFromRawX(surfaceX * scale);
      if (!payload) {
        releaseTouchSession();
        return;
      }
      activeTouchRef.current = {
        pageOriginX: isFiniteNumber(point.pageX)
          ? point.pageX - surfaceX
          : null,
        startPageX: isFiniteNumber(point.pageX) ? point.pageX : null,
        startPageY: isFiniteNumber(point.pageY) ? point.pageY : null,
        scale,
        horizontal: false,
      };
      handleTooltipChange(payload);
      sessionCallbackRef.current?.(pageTouchSession);
    },
    [
      buildTooltipPayloadFromRawX,
      handleTooltipChange,
      handleTouchEnd,
      pageTouchSession,
      releaseTouchSession,
      width,
    ],
  );

  const touchHandlers = useMemo(
    () => ({
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
    }),
    [handleTouchEnd, handleTouchMove, handleTouchStart],
  );

  const ignoreMouse = useCallback(
    (event?: ChartMouseEvent) =>
      activeTouchRef.current != null ||
      Date.now() < ignoreMouseUntilRef.current ||
      event?.nativeEvent.sourceCapabilities?.firesTouchEvents === true,
    [],
  );

  const handleMousePoint = useCallback(
    (event: ChartMouseEvent) => {
      if (ignoreMouse(event)) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect?.();
      if (!rect) {
        return;
      }
      const scale =
        isFiniteNumber(rect.width) && rect.width > 0 ? width / rect.width : 1;
      const payload = buildTooltipPayloadFromRawX(
        (event.nativeEvent.clientX - rect.left) * scale,
      );
      if (payload) {
        handleTooltipChange(payload);
      }
    },
    [buildTooltipPayloadFromRawX, handleTooltipChange, ignoreMouse, width],
  );

  const mouseHandlers =
    Platform.OS === 'web'
      ? {
          onMouseMove: handleMousePoint,
          onMouseDown: (event: ChartMouseEvent) => {
            if (!ignoreMouse(event)) {
              event.preventDefault?.();
              handleMousePoint(event);
            }
          },
          onMouseLeave: () => {
            if (!ignoreMouse()) {
              handleTooltipChange(null);
            }
          },
        }
      : {};

  // Use values, not the domain array identity: callers may recreate that
  // array every render. A new day/range/orientation invalidates selection.
  const selectionSpace = `${domainStartMs}:${domainEndMs}:${width}:${margin.left}:${margin.right}`;
  const selectionSpaceRef = useRef(selectionSpace);
  useEffect(() => {
    if (selectionSpaceRef.current !== selectionSpace) {
      selectionSpaceRef.current = selectionSpace;
      clearTooltipTimer();
      clearTooltipState();
      releaseTouchSession();
    }
  }, [
    clearTooltipState,
    clearTooltipTimer,
    releaseTouchSession,
    selectionSpace,
  ]);

  useEffect(
    () => () => {
      clearTooltipTimer();
      releaseTouchSession();
    },
    [clearTooltipTimer, releaseTouchSession],
  );

  return {chartsTooltip, handleTooltipChange, touchHandlers, mouseHandlers};
}
