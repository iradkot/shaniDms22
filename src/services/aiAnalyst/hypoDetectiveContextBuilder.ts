import {fetchBgDataForDateRangeUncached, fetchTreatmentsForDateRangeUncached} from 'app/api/apiRequests';
import {enrichBgSamplesWithDeviceStatusForRange} from 'app/utils/stackedChartsData.utils';
import {extractHypoEvents} from 'app/containers/MainTabsNavigator/Containers/Trends/utils/hypoInvestigation.utils';
import {BgSample} from 'app/types/day_bgs.types';
import {buildRecordedInsulinSummary, deduplicateInsulinRecords, getInsulinStartMs} from 'app/services/insulin/recordedInsulin';

function clampInt(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, Math.trunc(v)));
}

function weekdayLocal(ts: number): string {
  try {
    return new Date(ts).toLocaleDateString(undefined, {weekday: 'long'});
  } catch {
    return 'Unknown';
  }
}

function localHour(ts: number): number {
  const d = new Date(ts);
  return clampInt(d.getHours(), 0, 23);
}

function safeNum(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function summarizeTreatmentsWindow(params: {
  treatments: any[];
  fromMs: number;
  toMs: number;
  observedAtMs: number;
}): {
  bolusU: number | null;
  bolusCount: number | null;
  carbsG: number;
  carbsCount: number;
  tempBasalCount: number;
} {
  const {treatments, fromMs, toMs, observedAtMs} = params;
  const period = {startMs: fromMs, endMs: toMs + 1};
  const records = deduplicateInsulinRecords((treatments ?? []).filter(t =>
    t && typeof t === 'object' && !Array.isArray(t),
  )).filter(t => t.isValid !== false && t.deleted !== true);
  const recorded = buildRecordedInsulinSummary(records, period, observedAtMs);
  const bolusU = recorded.quality === 'unavailable' ? undefined : recorded.bolusUnits;

  let bolusCount = 0;
  let carbsG = 0;
  let carbsCount = 0;
  let tempBasalCount = 0;

  for (const t of records) {
    if (/bolus/i.test(String(t.eventType ?? ''))) {
      const dose = buildRecordedInsulinSummary([t], period, observedAtMs);
      if (dose.quality !== 'unavailable' && dose.bolusUnits !== undefined && dose.bolusUnits > 0) {
        bolusCount += 1;
      }
    }
    const ts = getInsulinStartMs(t);
    if (!Number.isFinite(ts) || ts < fromMs || ts > toMs) continue;

    const eventType = t?.eventType;

    // Carbs
    if (typeof t?.carbs === 'number' && Number.isFinite(t.carbs) && t.carbs > 0) {
      carbsG += t.carbs;
      carbsCount += 1;
    }

    // Temp basal / pump actions (best-effort)
    if (eventType === 'Temp Basal') {
      tempBasalCount += 1;
      continue;
    }
  }

  return {
    bolusU: bolusU === undefined ? null : Number(bolusU.toFixed(2)),
    bolusCount: bolusU === undefined ? null : bolusCount,
    carbsG: Math.round(carbsG),
    carbsCount,
    tempBasalCount,
  };
}

function pickNadirSample(enrichedBg: BgSample[], nadirMs: number): BgSample | null {
  if (!enrichedBg?.length) return null;

  // BG is sorted asc in fetchers; find closest within +/-10 minutes.
  const MAX_DIST_MS = 10 * 60_000;
  let best: BgSample | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  for (const s of enrichedBg) {
    const ts = s?.date;
    if (typeof ts !== 'number') continue;
    const dist = Math.abs(ts - nadirMs);
    if (dist < bestDist) {
      bestDist = dist;
      best = s;
    }
  }

  if (bestDist > MAX_DIST_MS) return null;
  return best;
}

export async function buildHypoDetectiveContext(params: {
  rangeDays: number;
  lowThreshold: number;
  maxEvents?: number;
  onProgress?: (s: string) => void;
}): Promise<{contextJson: any; debug: {eventCount: number}}> {
  const {rangeDays, lowThreshold, onProgress} = params;
  const maxEvents = Math.max(1, Math.round(params.maxEvents ?? 12));

  const endMs = Date.now();
  const startMs = endMs - Math.max(1, rangeDays) * 24 * 60 * 60 * 1000;

  onProgress?.('Fetching CGM data…');
  const bgData = await fetchBgDataForDateRangeUncached(new Date(startMs), new Date(endMs));

  onProgress?.('Enriching with device status (IOB/COB)…');
  const enrichedBg = await enrichBgSamplesWithDeviceStatusForRange({
    startMs,
    endMs,
    bgSamples: bgData,
  });

  onProgress?.('Finding severe hypos…');
  const events = extractHypoEvents({bgData: enrichedBg, lowThreshold});

  const severe = events
    .filter(e => typeof e?.nadirSgv === 'number' && e.nadirSgv <= lowThreshold)
    .slice(0, maxEvents);

  onProgress?.('Fetching treatments…');
  // Include the earliest event's two-hour context and the one-day delivery carry-in.
  const treatments = await fetchTreatmentsForDateRangeUncached(
    new Date(startMs - 26 * 60 * 60_000),
    new Date(endMs),
  );

  onProgress?.('Summarizing events…');
  const outEvents = severe.map(e => {
    const nadirSample = pickNadirSample(enrichedBg, e.nadirMs) ?? e.nadirSample;

    const iob = safeNum((nadirSample as any)?.iob);
    const cob = safeNum((nadirSample as any)?.cob);

    const bolusWindow = summarizeTreatmentsWindow({
      treatments,
      fromMs: e.nadirMs - 60 * 60_000,
      toMs: e.nadirMs,
      observedAtMs: endMs,
    });

    const carbsWindow = summarizeTreatmentsWindow({
      treatments,
      fromMs: e.nadirMs - 2 * 60 * 60_000,
      toMs: e.nadirMs,
      observedAtMs: endMs,
    });

    const tempBasalWindow = summarizeTreatmentsWindow({
      treatments,
      fromMs: e.nadirMs - 2 * 60 * 60_000,
      toMs: e.nadirMs,
      observedAtMs: endMs,
    });

    return {
      startMs: e.startMs,
      endMs: e.endMs,
      nadirMs: e.nadirMs,
      nadirMgdl: e.nadirSgv,
      weekday: weekdayLocal(e.nadirMs),
      localHour: localHour(e.nadirMs),
      minutesLow: Math.max(0, Math.round((e.endMs - e.startMs) / 60_000)),

      // Load values (best-effort)
      iobU: iob,
      cobG: cob,
      splitIobBolusU: safeNum((nadirSample as any)?.iobBolus),
      splitIobBasalU: safeNum((nadirSample as any)?.iobBasal),
      driver: e.driver,

      // Treatment summaries
      bolusLast1h: bolusWindow,
      carbsLast2h: carbsWindow,
      pumpActionsLast2h: {tempBasalCount: tempBasalWindow.tempBasalCount},
    };
  });

  return {
    contextJson: {
      kind: 'hypoDetective.v1',
      range: {startMs, endMs, rangeDays},
      thresholds: {lowThresholdMgdl: lowThreshold},
      events: outEvents,
    },
    debug: {eventCount: outEvents.length},
  };
}
