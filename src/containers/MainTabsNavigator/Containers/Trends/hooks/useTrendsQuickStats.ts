import {useEffect, useMemo, useState} from 'react';

import {BgSample} from 'app/types/day_bgs.types';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {getInsulinRangeMetrics} from 'app/services/insulin/insulinRangeMetrics';
import {isE2E} from 'app/utils/e2e';
import {DEFAULT_NIGHT_WINDOW, isInHourWindowLocal} from 'app/constants/GLUCOSE_WINDOWS';
import {calculateTargetTimeInRangePct} from 'app/utils/glucose/timeInRange';

type TrendsQuickStats = {
  avgTddUPerDay: number | null;
  basalPct: number | null;
  bolusPct: number | null;
  hyposPerWeek: number;
  nightTirPct: number | null;
  avgCarbsGPerDay: number | null;
};

const HYPO_EVENT_MAX_GAP_MINUTES = 20;
const HYPO_EVENT_MAX_GAP_MS = HYPO_EVENT_MAX_GAP_MINUTES * 60 * 1000;

function countHypoEvents(samples: BgSample[], lowThreshold: number): number {
  const sorted = [...(samples ?? [])].sort((a, b) => a.date - b.date);
  let events = 0;
  let inEvent = false;
  let lastTs: number | null = null;

  for (const s of sorted) {
    const v = s?.sgv;
    const ts = s?.date;
    if (typeof v !== 'number' || !Number.isFinite(v) || typeof ts !== 'number') continue;

    const isHypo = v < lowThreshold;
    const gap = lastTs === null ? 0 : ts - lastTs;
    const gapBreaks = lastTs !== null && gap > HYPO_EVENT_MAX_GAP_MS;

    if (gapBreaks) {
      inEvent = false;
    }

    if (isHypo && !inEvent) {
      events += 1;
      inEvent = true;
    } else if (!isHypo) {
      inEvent = false;
    }

    lastTs = ts;
  }

  return events;
}

function computeNightTirPct(bgData: BgSample[]): number | null {
  const night = (bgData ?? []).filter(s => {
    if (typeof s?.date !== 'number') return false;
    const d = new Date(s.date);
    return isInHourWindowLocal(d, DEFAULT_NIGHT_WINDOW);
  });

  if (!night.length) return null;

  return calculateTargetTimeInRangePct(night, {
    veryLowMax: cgmRange[CGM_STATUS_CODES.VERY_LOW] as number,
    targetMin: cgmRange.TARGET.min,
    targetMax: cgmRange.TARGET.max,
    highMax: cgmRange[CGM_STATUS_CODES.VERY_HIGH] as number,
  });
}

export function useTrendsQuickStats(params: {
  bgData: BgSample[];
  start: Date;
  end: Date;
  rangeDays: number;
}): {
  stats: TrendsQuickStats;
  isLoading: boolean;
  error: string | null;
} {
  const {bgData, start, end, rangeDays} = params;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avgTddUPerDay, setAvgTddUPerDay] = useState<number | null>(null);
  const [basalPct, setBasalPct] = useState<number | null>(null);
  const [bolusPct, setBolusPct] = useState<number | null>(null);
  const [avgCarbsGPerDay, setAvgCarbsGPerDay] = useState<number | null>(null);

  const severeLowThresholdRaw = cgmRange[CGM_STATUS_CODES.EXTREME_LOW];
  const severeLowThreshold =
    typeof severeLowThresholdRaw === 'number' && Number.isFinite(severeLowThresholdRaw)
      ? severeLowThresholdRaw
      : cgmRange.TARGET.min;

  const hyposPerWeek = useMemo(() => {
    const events = countHypoEvents(bgData, severeLowThreshold);
    const days = Math.max(1, rangeDays || 1);
    return (events / days) * 7;
  }, [bgData, severeLowThreshold, rangeDays]);

  const nightTirPct = useMemo(() => {
    return computeNightTirPct(bgData);
  }, [bgData]);

  useEffect(() => {
    if (isE2E) {
      setAvgTddUPerDay(42.0);
      setBasalPct(55);
      setBolusPct(45);
      setAvgCarbsGPerDay(180);
      setError(null);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function run() {
      setIsLoading(true);
      setError(null);

      try {
        const metrics = await getInsulinRangeMetrics(start, end);

        if (!isMounted) return;

        const days = Math.max(1, rangeDays || 1);
        setAvgCarbsGPerDay(metrics.totalCarbs > 0 ? metrics.totalCarbs / days : null);

        if (metrics.totalInsulin > 0) {
          setAvgTddUPerDay(metrics.totalInsulin / days);
          const basal = (metrics.totalBasal / metrics.totalInsulin) * 100;
          setBasalPct(basal);
          setBolusPct(100 - basal);
        } else {
          setAvgTddUPerDay(null);
          setBasalPct(null);
          setBolusPct(null);
        }
      } catch (e: any) {
        if (!isMounted) return;
        setError(e?.message || 'Failed to load insulin/carbs stats');
        setAvgTddUPerDay(null);
        setBasalPct(null);
        setBolusPct(null);
        setAvgCarbsGPerDay(null);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    run();

    return () => {
      isMounted = false;
    };
  }, [end, rangeDays, start]);

  return {
    stats: {
      avgTddUPerDay,
      basalPct,
      bolusPct,
      hyposPerWeek,
      nightTirPct,
      avgCarbsGPerDay,
    },
    isLoading,
    error,
  };
}
