import {useCallback, useEffect, useMemo, useState} from 'react';

type ExtentMs = {minMs: number; maxMs: number};
export type ViewportMs = {startMs: number; endMs: number};

function clampViewport(viewport: ViewportMs, extent: ExtentMs): ViewportMs {
  const {minMs, maxMs} = extent;
  const spanMs = Math.max(0, maxMs - minMs);
  const windowMs = Math.max(1, viewport.endMs - viewport.startMs);

  if (spanMs <= 0) {
    return {startMs: minMs, endMs: maxMs};
  }

  if (windowMs >= spanMs) {
    return {startMs: minMs, endMs: maxMs};
  }

  let startMs = viewport.startMs;
  let endMs = viewport.endMs;

  if (startMs < minMs) {
    startMs = minMs;
    endMs = minMs + windowMs;
  }

  if (endMs > maxMs) {
    endMs = maxMs;
    startMs = maxMs - windowMs;
  }

  return {startMs, endMs};
}

/**
 * Home stacked chart viewport management (zoom + pan).
 *
 * Keeps an optional viewport window clamped to the current data extent.
 */
export function useHomeChartViewport(params: {
  extentMs: ExtentMs;
  /** Anchor point for zoom-in (usually latest sample time). */
  anchorMs?: number;
}) {
  const {extentMs, anchorMs} = params;
  const [chartViewportMs, setChartViewportMs] = useState<ViewportMs | null>(null);

  useEffect(() => {
    // When the underlying data extent changes (e.g. refresh/new day),
    // ensure the current viewport remains valid without causing render loops.
    setChartViewportMs(prev => {
      if (!prev) return prev;
      const next = clampViewport(prev, extentMs);
      if (next.startMs === prev.startMs && next.endMs === prev.endMs) {
        return prev;
      }
      return next;
    });
  }, [extentMs.minMs, extentMs.maxMs]);

  const isZoomed = !!chartViewportMs;

  const canPan = useMemo(() => {
    if (!chartViewportMs) return false;
    return (
      chartViewportMs.endMs - chartViewportMs.startMs < extentMs.maxMs - extentMs.minMs
    );
  }, [chartViewportMs, extentMs.maxMs, extentMs.minMs]);

  const canPanLeft = useMemo(() => {
    if (!chartViewportMs || !canPan) return false;
    return chartViewportMs.startMs > extentMs.minMs + 1;
  }, [chartViewportMs, canPan, extentMs.minMs]);

  const canPanRight = useMemo(() => {
    if (!chartViewportMs || !canPan) return false;
    return chartViewportMs.endMs < extentMs.maxMs - 1;
  }, [chartViewportMs, canPan, extentMs.maxMs]);

  const handleToggleZoom = useCallback(() => {
    if (chartViewportMs) {
      setChartViewportMs(null);
      return;
    }

    const {minMs, maxMs} = extentMs;
    const resolvedAnchorMs = anchorMs ?? maxMs;
    const zoomWindowMs = 3 * 60 * 60 * 1000; // 3 hours
    const next = clampViewport(
      {
        startMs: resolvedAnchorMs - zoomWindowMs / 2,
        endMs: resolvedAnchorMs + zoomWindowMs / 2,
      },
      {minMs, maxMs},
    );
    setChartViewportMs(next);
  }, [anchorMs, chartViewportMs, extentMs]);

  const handlePan = useCallback(
    (direction: 'left' | 'right') => {
      if (!chartViewportMs) return;
      const windowMs = Math.max(1, chartViewportMs.endMs - chartViewportMs.startMs);
      const stepMs = windowMs * 0.5;
      const delta = direction === 'left' ? -stepMs : stepMs;
      setChartViewportMs(prev =>
        prev
          ? clampViewport(
              {
                startMs: prev.startMs + delta,
                endMs: prev.endMs + delta,
              },
              extentMs,
            )
          : prev,
      );
    },
    [chartViewportMs, extentMs],
  );

  const chartXDomain = useMemo(() => {
    if (!chartViewportMs) return null;
    return [new Date(chartViewportMs.startMs), new Date(chartViewportMs.endMs)] as [
      Date,
      Date,
    ];
  }, [chartViewportMs]);

  return {
    chartViewportMs,
    setChartViewportMs,
    chartXDomain,
    isZoomed,
    canPanLeft,
    canPanRight,
    handleToggleZoom,
    handlePan,
  };
}
