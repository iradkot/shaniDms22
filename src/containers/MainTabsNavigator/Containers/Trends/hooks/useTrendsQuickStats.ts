import {useEffect, useMemo, useState} from 'react';

import {BgSample} from 'app/types/day_bgs.types';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {
  fetchTreatmentsForDateRangeUncached,
  getUserProfileFromNightscout,
} from 'app/api/apiRequests';
import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';
import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {isE2E} from 'app/utils/e2e';
import {DEFAULT_NIGHT_WINDOW, isInHourWindowLocal} from 'app/constants/GLUCOSE_WINDOWS';

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

function computeNightTirPct(bgData: BgSample[], targetMin: number, targetMax: number): number | null {
  const night = (bgData ?? []).filter(s => {
    if (typeof s?.date !== 'number') return false;
    const d = new Date(s.date);
    return isInHourWindowLocal(d, DEFAULT_NIGHT_WINDOW);
  });

  if (!night.length) return null;

  let inRange = 0;
  let valid = 0;

  for (const s of night) {
    const v = s?.sgv;
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    valid += 1;
    if (v >= targetMin && v <= targetMax) inRange += 1;
  }

  if (!valid) return null;
  return (inRange / valid) * 100;
}

function extractBasalProfile(profileData: any): BasalProfile {
  const entry = Array.isArray(profileData) ? profileData[0] : null;
  const defaultProfile = entry?.defaultProfile;
  const basal = entry?.store?.[defaultProfile]?.basal;
  return Array.isArray(basal) ? basal : [];
}

function mapTreatmentsToInsulinEntries(treatments: any[]): InsulinDataEntry[] {
  const out: InsulinDataEntry[] = [];

  for (const t of treatments ?? []) {
    const createdAt = t?.created_at;
    const eventType = t?.eventType;

    if (
      t?.insulin &&
      ['Bolus', 'Meal Bolus', 'Correction Bolus', 'Combo Bolus'].includes(eventType)
    ) {
      out.push({
        type: 'bolus',
        amount: t.insulin || t.amount || 0,
        timestamp: createdAt,
      });
      continue;
    }

    if (eventType === 'Temp Basal') {
      out.push({
        type: 'tempBasal',
        rate: t.rate || 0,
        duration: t.duration || 0,
        timestamp: createdAt,
      });
      continue;
    }

    // Optional: pump suspend support if event types match your Nightscout.
    if (eventType === 'Suspend Pump' || eventType === 'Pump Suspend') {
      if (t?.created_at && t?.duration) {
        const start = new Date(t.created_at);
        const end = new Date(start.getTime() + Number(t.duration) * 60 * 1000);
        out.push({
          type: 'suspendPump',
          startTime: start.toISOString(),
          endTime: end.toISOString(),
        });
      }
    }
  }

  return out;
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

  const targetMin = cgmRange.TARGET.min;
  const targetMax = cgmRange.TARGET.max;

  const hyposPerWeek = useMemo(() => {
    const events = countHypoEvents(bgData, severeLowThreshold);
    const days = Math.max(1, rangeDays || 1);
    return (events / days) * 7;
  }, [bgData, severeLowThreshold, rangeDays]);

  const nightTirPct = useMemo(() => {
    return computeNightTirPct(bgData, targetMin, targetMax);
  }, [bgData, targetMax, targetMin]);

  useEffect(() => {
    if (isE2E) {
      // Deterministic values for E2E builds.
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
        const [treatments, profileData] = await Promise.all([
          fetchTreatmentsForDateRangeUncached(start, end),
          getUserProfileFromNightscout(start.toISOString()),
        ]);

        if (!isMounted) return;

        const basalProfile = extractBasalProfile(profileData);
        const insulinEntries = mapTreatmentsToInsulinEntries(treatments);

        // Carbs
        const totalCarbs = (treatments ?? []).reduce((sum, t) => {
          const c = t?.carbs;
          return typeof c === 'number' && Number.isFinite(c) ? sum + c : sum;
        }, 0);
        const days = Math.max(1, rangeDays || 1);
        setAvgCarbsGPerDay(totalCarbs > 0 ? totalCarbs / days : null);

        // Insulin totals
        const {totalBasal, totalBolus} = calculateTotalInsulin(
          insulinEntries,
          basalProfile,
          start,
          end,
        );

        const total = totalBasal + totalBolus;
        if (total > 0) {
          setAvgTddUPerDay(total / days);
          const basal = (totalBasal / total) * 100;
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
