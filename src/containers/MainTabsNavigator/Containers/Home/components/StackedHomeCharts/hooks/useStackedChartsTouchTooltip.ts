import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {type GestureResponderEvent} from 'react-native';
import * as d3 from 'd3';

import type {ChartMargin} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import type {CGMGraphExternalTooltipPayload} from 'app/components/charts/CgmGraph/CgmGraph';
import {buildExternalTooltipPayloadFromLocationX} from 'app/components/charts/CgmGraph/utils/externalTooltipTouch.utils';
import type {BgSample} from 'app/types/day_bgs.types';

type UseStackedChartsTouchTooltipParams = {
  bgSamples: BgSample[];
  width: number;
  margin: ChartMargin;
  xDomain?: [Date, Date] | null;
  autoHideMs?: number;
};

export function useStackedChartsTouchTooltip({
  bgSamples,
  width,
  margin,
  xDomain,
  autoHideMs = 4000,
}: UseStackedChartsTouchTooltipParams) {
  const [chartsTooltip, setChartsTooltip] =
    useState<CGMGraphExternalTooltipPayload | null>(null);

  const lastPayloadRef =
    useRef<CGMGraphExternalTooltipPayload | null>(null);
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
    const plotWidth = Math.max(1, width - margin.left - margin.right);
    return d3.scaleTime().domain(resolvedDomain).range([0, plotWidth]);
  }, [bgSamples, margin.left, margin.right, width, xDomain]);

  const buildTooltipPayload = useCallback(
    (evt: GestureResponderEvent): CGMGraphExternalTooltipPayload | null => {
      const rawX = evt.nativeEvent.locationX;
      if (typeof rawX !== 'number' || !Number.isFinite(rawX)) {
        return null;
      }

      return buildExternalTooltipPayloadFromLocationX({
        rawX,
        plotMarginLeft: margin.left,
        plotWidth: Math.max(1, width - margin.left - margin.right),
        xScale,
      });
    },
    [margin.left, margin.right, width, xScale],
  );

  const handleTouchPoint = useCallback(
    (evt: GestureResponderEvent) => {
      const payload = buildTooltipPayload(evt);
      if (payload) {
        handleTooltipChange(payload);
      }
    },
    [buildTooltipPayload, handleTooltipChange],
  );

  const handleTouchEnd = useCallback(() => {
    handleTooltipChange(null);
  }, [handleTooltipChange]);

  const handleTouchCancel = useCallback(() => {
    // Keep the last selection visible when ScrollView or another responder
    // takes over. If no release arrives afterwards, clear it as stale.
    const lastPayload = lastPayloadRef.current;
    if (lastPayload) {
      setActiveTooltip(lastPayload);
      scheduleTooltipAutoHide();
    }
  }, [scheduleTooltipAutoHide, setActiveTooltip]);

  const touchHandlers = useMemo(
    () => ({
      onTouchStart: handleTouchPoint,
      onTouchMove: handleTouchPoint,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchCancel,
    }),
    [handleTouchCancel, handleTouchEnd, handleTouchPoint],
  );

  return {
    chartsTooltip,
    handleTooltipChange,
    touchHandlers,
  };
}
