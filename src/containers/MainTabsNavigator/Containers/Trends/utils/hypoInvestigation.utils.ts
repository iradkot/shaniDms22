import {BgSample} from 'app/types/day_bgs.types';

const HYPO_EVENT_MAX_GAP_MINUTES = 20;
const HYPO_EVENT_MAX_GAP_MS = HYPO_EVENT_MAX_GAP_MINUTES * 60 * 1000;

export type HypoDriver = 'basal' | 'bolus';

export type HypoEvent = {
  /** Stable identifier for rendering (derived from start time). */
  id: string;

  startMs: number;
  endMs: number;

  /** Timestamp of lowest glucose within the event (ms). */
  nadirMs: number;
  nadirSgv: number;

  /** Sample at nadir (useful for IOB split classification). */
  nadirSample: BgSample;

  /** If we can classify from split IOB, this is set. */
  driver: HypoDriver | null;

  iobBolusU: number | null;
  iobBasalU: number | null;
};

function safeNumber(v: unknown): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return v;
}

export function classifyHypoDriverFromSplitIob(sample: BgSample): {
  driver: HypoDriver;
  iobBolusU: number;
  iobBasalU: number;
} | null {
  const bolusRaw = safeNumber(sample.iobBolus);
  const basalRaw = safeNumber(sample.iobBasal);

  if (bolusRaw == null && basalRaw == null) return null;

  const iobBolusU = Math.max(0, bolusRaw ?? 0);
  const iobBasalU = Math.max(0, basalRaw ?? 0);

  // Tie-breaker: prefer basal if equal.
  const driver: HypoDriver = iobBolusU > iobBasalU ? 'bolus' : 'basal';
  return {driver, iobBolusU, iobBasalU};
}

/**
 * Extracts distinct hypo events from BG samples.
 *
 * Event logic (matches Trends quick stats):
 * - A hypo event starts when we enter < threshold.
 * - It ends when we leave hypo, or if there is a time gap > 20 minutes.
 */
export function extractHypoEvents(params: {
  bgData: BgSample[];
  lowThreshold: number;
}): HypoEvent[] {
  const {bgData, lowThreshold} = params;

  const sorted = [...(bgData ?? [])]
    .filter(s => typeof s?.date === 'number' && typeof s?.sgv === 'number')
    .sort((a, b) => a.date - b.date);

  const events: Array<{
    startMs: number;
    endMs: number;
    nadirSample: BgSample;
  }> = [];

  let inEvent = false;
  let lastTs: number | null = null;

  let currentStartMs: number | null = null;
  let currentEndMs: number | null = null;
  let currentNadir: BgSample | null = null;

  const finalize = () => {
    if (!inEvent || currentStartMs == null || currentEndMs == null || currentNadir == null) {
      inEvent = false;
      currentStartMs = null;
      currentEndMs = null;
      currentNadir = null;
      return;
    }

    events.push({
      startMs: currentStartMs,
      endMs: currentEndMs,
      nadirSample: currentNadir,
    });

    inEvent = false;
    currentStartMs = null;
    currentEndMs = null;
    currentNadir = null;
  };

  for (const s of sorted) {
    const v = s?.sgv;
    const ts = s?.date;
    if (typeof v !== 'number' || !Number.isFinite(v) || typeof ts !== 'number') continue;

    const isHypo = v <= lowThreshold;
    const gap = lastTs === null ? 0 : ts - lastTs;
    const gapBreaks = lastTs !== null && gap > HYPO_EVENT_MAX_GAP_MS;

    if (gapBreaks) {
      // Discontinuity splits events.
      finalize();
    }

    if (isHypo && !inEvent) {
      inEvent = true;
      currentStartMs = ts;
      currentEndMs = ts;
      currentNadir = s;
    } else if (isHypo && inEvent) {
      currentEndMs = ts;
      if (currentNadir == null || v < currentNadir.sgv) {
        currentNadir = s;
      }
    } else if (!isHypo && inEvent) {
      // Exit hypo range -> close event.
      finalize();
    }

    lastTs = ts;
  }

  // Close if we ended while still hypo.
  finalize();

  // Build enriched output; sort newest-first for UI list.
  return events
    .map(e => {
      const classification = classifyHypoDriverFromSplitIob(e.nadirSample);
      return {
        id: String(e.startMs),
        startMs: e.startMs,
        endMs: e.endMs,
        nadirMs: e.nadirSample.date,
        nadirSgv: e.nadirSample.sgv,
        nadirSample: e.nadirSample,
        driver: classification?.driver ?? null,
        iobBolusU: classification?.iobBolusU ?? null,
        iobBasalU: classification?.iobBasalU ?? null,
      };
    })
    .sort((a, b) => b.startMs - a.startMs);
}

export const HYPO_INVESTIGATION_CONSTANTS = {
  windowHoursBefore: 3,
  windowHoursAfter: 3,
} as const;
