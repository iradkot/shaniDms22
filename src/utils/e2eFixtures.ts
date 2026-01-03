import {BgSample} from 'app/types/day_bgs.types';

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Deterministic pseudo-random in [0, 1) from an integer seed.
 * (LCG: good enough for fixtures, stable across JS runtimes.)
 */
function seededUnit(seed: number): number {
  const a = 9301;
  const c = 49297;
  const m = 233280;
  return ((seed * a + c) % m) / m;
}

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Generate deterministic BG samples for E2E.
 *
 * Why: In E2E (Maestro) we often run against accounts/environments with no CGM
 * data, causing chart components to render nothing (and E2E selectors to be
 * missing). These fixtures let us verify chart surfaces reliably without
 * changing production behaviour.
 */
export function makeE2EBgSamplesForDate(date: Date): BgSample[] {
  const dayStart = startOfDay(date).getTime();
  const samplesPerDay = Math.floor(ONE_DAY_MS / FIFTEEN_MINUTES_MS);

  // Add per-day deterministic variation so AGP (which aggregates by time-of-day
  // across days) produces non-collapsed percentile bands.
  const dayIndex = Math.floor(dayStart / ONE_DAY_MS);
  const dayJitter = seededUnit(dayIndex);
  const base = 110 + Math.round((dayJitter - 0.5) * 14); // +/- ~7 mg/dL
  const amplitude = 18 + Math.round(seededUnit(dayIndex + 17) * 10); // 18..28
  const phase = seededUnit(dayIndex + 31) * Math.PI * 2;

  const samples: BgSample[] = [];
  for (let i = 0; i < samplesPerDay; i++) {
    const timestamp = dayStart + i * FIFTEEN_MINUTES_MS;
    const withinDayNoise = Math.round(4 * Math.sin(i / 3 + dayIndex));
    const sgv = clamp(
      base + Math.round(amplitude * Math.sin(i / 10 + phase)) + withinDayNoise,
      55,
      220,
    );

    // Provide deterministic IOB/COB so LoadBars is exercised in E2E runs.
    // Values are kept in realistic ranges and vary through the day.
    const iobTotal = clamp(1.6 + 1.4 * Math.sin(i / 8 + phase), 0, 4);
    const iobBolus = clamp(iobTotal * 0.75, 0, 4);
    const iobBasal = clamp(iobTotal - iobBolus, 0, 4);
    const cob = clamp(35 + 25 * Math.sin(i / 6 + phase / 2), 0, 90);

    samples.push({
      sgv,
      date: timestamp,
      dateString: new Date(timestamp).toISOString(),
      trend: 0,
      direction: 'Flat',
      device: 'e2e',
      type: 'sgv',
      iob: iobTotal,
      iobBolus,
      iobBasal,
      cob,
    });
  }

  return samples;
}

/**
 * Generate deterministic BG samples spanning a date range.
 */
export function makeE2EBgSamplesForRange(start: Date, end: Date): BgSample[] {
  const startMs = start.getTime();
  const endMs = end.getTime();

  const all: BgSample[] = [];
  for (
    let cursor = startOfDay(start);
    cursor.getTime() <= endMs;
    cursor = new Date(cursor.getTime() + ONE_DAY_MS)
  ) {
    all.push(...makeE2EBgSamplesForDate(cursor));
  }

  return all.filter(s => s.date >= startMs && s.date <= endMs);
}
