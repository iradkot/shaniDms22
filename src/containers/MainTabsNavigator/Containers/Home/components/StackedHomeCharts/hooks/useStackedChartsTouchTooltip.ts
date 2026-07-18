import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {type GestureResponderEvent} from 'react-native';
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
  xDomain?: [Date, Date] | null;
  autoHideMs?: number;
  scrollSafeEdgeWidth?: number;
  onTouchSessionChange?: (session: StackedChartsTouchSession | null) => void;
};

export function useStackedChartsTouchTooltip({
  bgSamples,
  width,
  margin,
  xDomain,
  autoHideMs = 4000,
  scrollSafeEdgeWidth = 0,
  onTouchSessionChange,
}: UseStackedChartsTouchTooltipParams) {
  const [chartsTooltip, setChartsTooltip] =
    useState<CGMGraphExternalTooltipPayload | null>(null);

  const lastPayloadRef =
    useRef<CGMGraphExternalTooltipPayload | null>(null);
  const touchSurfacePageXRef = useRef<number | null>(null);
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const clearTooltipTimer = useCallback(() => {
    if (tooltipTimerRef.current) {
      clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }, []);

  const clearTooltipState = useCallback(() => {
    lastPayloadRef.current = null;
    touchSurfacePageXRef.current = null;
    setChartsTooltip(null);
  }, []);

  const scheduleTooltipAutoHide = useCallback(() => {
    clearTooltipTimer();
    tooltipTimerRef.current = setTimeout(() => {
      clearTooltipState();
      tooltipTimerRef.current = null;
    }, autoHideMs);
  }, [autoHideMs, clearTooltipState, clearTooltipTimer]);

  const setActiveTooltip = useCallback(
    (payload: CGMGraphExternalTooltipPayload) => {
      lastPayloadRef.current = payload;
      setChartsTooltip(payload);
    },
    [],
  );

  const handleTooltipChange = useCallback(
    (payload: CGMGraphExternalTooltipPayload | null) => {
      clearTooltipTimer();

      if (!payload) {
        clearTooltipState();
        return;
      }

      setActiveTooltip(payload);
      if (payload?.autoHide) {
        scheduleTooltipAutoHide();
      }
    },
    [
      clearTooltipState,
      clearTooltipTimer,
      scheduleTooltipAutoHide,
      setActiveTooltip,
    ],
  );

  useEffect(() => clearTooltipTimer, [clearTooltipTimer]);

  const plotWidth = useMemo(
    () => Math.max(1, width - margin.left - margin.right),
    [margin.left, margin.right, width],
  );

  const xScale = useMemo(() => {
    const resolvedDomain =
      xDomain ??
      (() => {
        const extent = d3.extent(bgSamples, s => new Date(s.date));
        if (extent[0] && extent[1]) {
          return extent as [Date, Date];
        }
        const now = new Date();
        return [now, now] as [Date, Date];
      })();
    return d3.scaleTime().domain(resolvedDomain).range([0, plotWidth]);
  }, [bgSamples, plotWidth, xDomain]);

  const buildTooltipPayloadFromRawX = useCallback(
    (rawX: number): CGMGraphExternalTooltipPayload | null => {
      if (typeof rawX !== 'number' || !Number.isFinite(rawX)) {
        return null;
      }
      if (scrollSafeEdgeWidth > 0 && rawX >= width - scrollSafeEdgeWidth) {
        return null;
      }

      return buildExternalTooltipPayloadFromLocationX({
        rawX,
        plotMarginLeft: margin.left,
        plotWidth,
        xScale,
      });
    },
    [margin.left, plotWidth, scrollSafeEdgeWidth, width, xScale],
  );

  const buildTooltipPayload = useCallback(
    (evt: GestureResponderEvent): CGMGraphExternalTooltipPayload | null => {
      return buildTooltipPayloadFromRawX(evt.nativeEvent.locationX);
    },
    [buildTooltipPayloadFromRawX],
  );

  const buildTooltipPayloadFromPageX = useCallback(
    (pageX: number): CGMGraphExternalTooltipPayload | null => {
      const surfacePageX = touchSurfacePageXRef.current;
      if (surfacePageX == null) {
        return null;
      }

      return buildTooltipPayloadFromRawX(pageX - surfacePageX);
    },
    [buildTooltipPayloadFromRawX],
  );

  const rememberTouchSurface = useCallback((evt: GestureResponderEvent) => {
    const {locationX, pageX} = evt.nativeEvent;
    if (
      typeof locationX === 'number' &&
      Number.isFinite(locationX) &&
      typeof pageX === 'number' &&
      Number.isFinite(pageX)
    ) {
      touchSurfacePageXRef.current = pageX - locationX;
    }
  }, []);

  const handlePageTouchMove = useCallback(
    (evt: GestureResponderEvent) => {
      const pageX = evt.nativeEvent.pageX;
      if (typeof pageX !== 'number' || !Number.isFinite(pageX)) {
        return;
      }

      const payload = buildTooltipPayloadFromPageX(pageX);
      if (payload) {
        handleTooltipChange(payload);
      }
    },
    [buildTooltipPayloadFromPageX, handleTooltipChange],
  );

  const handleTouchEnd = useCallback(() => {
    onTouchSessionChange?.(null);
    handleTooltipChange(null);
  }, [handleTooltipChange, onTouchSessionChange]);

  const handleTouchCancel = useCallback(() => {
    // Keep the last selection visible when ScrollView or another responder
    // takes over. If no release arrives afterwards, clear it as stale.
    const lastPayload = lastPayloadRef.current;
    if (lastPayload) {
      setActiveTooltip(lastPayload);
      scheduleTooltipAutoHide();
    }
  }, [scheduleTooltipAutoHide, setActiveTooltip]);

  const handlePageTouchCancel = useCallback(() => {
    onTouchSessionChange?.(null);
    handleTouchCancel();
  }, [handleTouchCancel, onTouchSessionChange]);

  const pageTouchSession = useMemo<StackedChartsTouchSession>(
    () => ({
      handlePageTouchMove,
      handlePageTouchEnd: handleTouchEnd,
      handlePageTouchCancel,
    }),
    [handlePageTouchCancel, handlePageTouchMove, handleTouchEnd],
  );

  const registerTouchSession = useCallback(() => {
    onTouchSessionChange?.(pageTouchSession);
  }, [onTouchSessionChange, pageTouchSession]);

  const handleTouchPoint = useCallback(
    (evt: GestureResponderEvent) => {
      rememberTouchSurface(evt);
      const payload = buildTooltipPayload(evt);
      if (payload) {
        handleTooltipChange(payload);
        registerTouchSession();
      }
    },
    [
      buildTooltipPayload,
      handleTooltipChange,
      registerTouchSession,
      rememberTouchSurface,
    ],
  );

  const touchHandlers = useMemo(
    () => ({
      onTouchStart: handleTouchPoint,
      onTouchMove: handleTouchPoint,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    }),
    [handleTouchCancel, handleTouchEnd, handleTouchPoint],
  );

  useEffect(() => {
    if (!chartsTooltip) {
      onTouchSessionChange?.(null);
      return;
    }

    onTouchSessionChange?.(pageTouchSession);
  }, [chartsTooltip, onTouchSessionChange, pageTouchSession]);

  return {
    chartsTooltip,
    handleTooltipChange,
    touchHandlers,
  };
}
