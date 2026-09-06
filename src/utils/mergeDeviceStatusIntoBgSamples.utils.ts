import {BgSample} from 'app/types/day_bgs.types';
import {DeviceStatusEntry} from 'app/types/deviceStatus.types';

/** Maximum allowed timestamp distance when matching BG↔deviceStatus. */
const MAX_MATCH_DISTANCE_MS = 10 * 60 * 1000;

const SORT_ORDER_CHECK_COUNT = 2;

function finiteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function clampNonNegative(value: unknown): number | undefined {
  const finite = finiteNumber(value);
  return finite == null ? undefined : Math.max(0, finite);
}

/**
 * Extracts the best-available timestamp in milliseconds for a deviceStatus entry.
 *
 * Loop values often include their own timestamps (aligned to computation time).
 * Prefer those when available.
 */
export function getDeviceStatusTimestampMs(
  entry: DeviceStatusEntry,
): number | undefined {
  // Loop payload provides timestamps that align to the computed iob/cob time.
  if (typeof entry.loop?.iob?.timestamp === 'string') {
    const ms = Date.parse(entry.loop.iob.timestamp);
    if (Number.isFinite(ms)) {
      return ms;
    }
  }
  if (typeof entry.loop?.cob?.timestamp === 'string') {
    const ms = Date.parse(entry.loop.cob.timestamp);
    if (Number.isFinite(ms)) {
      return ms;
    }
  }
  if (typeof entry.loop?.timestamp === 'string') {
    const ms = Date.parse(entry.loop.timestamp);
    if (Number.isFinite(ms)) {
      return ms;
    }
  }
  if (typeof entry.mills === 'number' && Number.isFinite(entry.mills)) {
    return entry.mills;
  }
  if (typeof entry.created_at === 'string') {
    const ms = Date.parse(entry.created_at);
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

/**
 * Extracts load values (IOB/COB) from a deviceStatus entry.
 *
 * - Preserves signed IOB values; negative basal IOB is meaningful
 * - Supports Loop payloads under `loop`, OpenAPS under `openaps`, and top-level fallbacks
 */
export function extractLoad(entry: DeviceStatusEntry): {
  iob?: number;
  iobBolus?: number;
  iobBasal?: number;
  cob?: number;
} {
  // Total IOB
  const iob =
    finiteNumber(entry.loop?.iob?.iob) ??
    finiteNumber(entry.openaps?.iob?.iob) ??
    finiteNumber(entry.iob);

  // Split IOB (if provided by source)
  const iobBolus =
    finiteNumber(entry.loop?.iob?.bolusIob) ??
    finiteNumber(entry.openaps?.iob?.bolusiob);
  const iobBasal =
    finiteNumber(entry.loop?.iob?.basalIob) ??
    finiteNumber(entry.openaps?.iob?.basaliob);

  // COB
  const cob =
    clampNonNegative(entry.loop?.cob?.cob) ??
    clampNonNegative(entry.openaps?.meal?.cob) ??
    clampNonNegative(entry.openaps?.cob?.cob) ??
    clampNonNegative(entry.cob);

  // An unavailable component is unknown, not zero. Keep independently known
  // components, and derive a total only when both parts were actually reported.
  const total =
    iob ??
    (iobBolus !== undefined && iobBasal !== undefined
      ? iobBolus + iobBasal
      : undefined);

  return {
    ...(total !== undefined ? {iob: total} : {}),
    ...(iobBolus !== undefined ? {iobBolus} : {}),
    ...(iobBasal !== undefined ? {iobBasal} : {}),
    ...(cob !== undefined ? {cob} : {}),
  };
}

const hasOwn = (value: unknown, property: string): boolean =>
  value !== null &&
  typeof value === 'object' &&
  Object.prototype.hasOwnProperty.call(value, property);

/** Explicit load fields may report unknown values. Uploader-only status is not a measurement. */
export const hasNightscoutLoadReport = (entry: DeviceStatusEntry): boolean =>
  hasOwn(entry, 'iob') ||
  hasOwn(entry, 'cob') ||
  hasOwn(entry.loop, 'iob') ||
  hasOwn(entry.loop, 'cob') ||
  hasOwn(entry.openaps, 'iob') ||
  hasOwn(entry.openaps, 'cob') ||
  hasOwn(entry.openaps?.meal, 'cob');

export type NightscoutLoadSample = Readonly<
  {timestampMs: number} & ReturnType<typeof extractLoad>
>;

/** A timestamp-only sample intentionally breaks interpolation through missing load data. */
export function decodeNightscoutLoadSample(
  entry: DeviceStatusEntry,
): NightscoutLoadSample | undefined {
  if (!hasNightscoutLoadReport(entry)) {
    return undefined;
  }
  const timestampMs = getDeviceStatusTimestampMs(entry);
  return timestampMs === undefined
    ? undefined
    : {timestampMs, ...extractLoad(entry)};
}

/** Compatibility facade for callers that need raw Nightscout device-status records. */
export function mergeDeviceStatusIntoBgSamples(params: {
  bgSamples: BgSample[];
  deviceStatus: DeviceStatusEntry[];
}): BgSample[] {
  return mergeLoadSamplesIntoBgSamples({
    bgSamples: params.bgSamples,
    loadSamples: params.deviceStatus.flatMap(entry => {
      const sample = decodeNightscoutLoadSample(entry);
      return sample === undefined ? [] : [sample];
    }),
  });
}

/**
 * Merges Loop/OpenAPS "load" values (IOB/COB) from device status into BG samples.
 *
 * Matching strategy:
 * - Build a timestamp-sorted deviceStatus list
 * - For each BG sample, pick the closest deviceStatus entry (prev/next)
 * - Only apply the match if the closest entry is within `MAX_MATCH_DISTANCE_MS`
 */
export function mergeLoadSamplesIntoBgSamples(params: {
  bgSamples: BgSample[];
  loadSamples: readonly NightscoutLoadSample[];
}): BgSample[] {
  const inputBgSamples = params.bgSamples;
  const deviceStatus = params.loadSamples
    .filter(sample => Number.isFinite(sample.timestampMs))
    .map(({timestampMs, ...load}) => ({ts: timestampMs, load}))
    .sort((a, b) => a.ts - b.ts);

  if (!deviceStatus.length) {
    return inputBgSamples;
  }

  // BG is usually sorted newest->oldest in this app; handle either order.
  const isAscending =
    inputBgSamples.length >= SORT_ORDER_CHECK_COUNT
      ? (inputBgSamples[0]?.date ?? 0) < (inputBgSamples[1]?.date ?? 0)
      : true;
  const ordered = isAscending ? inputBgSamples : [...inputBgSamples].reverse();

  let dsIndex = 0;

  const enrichedAsc = ordered.map(sample => {
    const targetTs = sample.date;

    // Advance to the last status with ts <= targetTs
    while (
      dsIndex + 1 < deviceStatus.length &&
      (deviceStatus[dsIndex + 1]?.ts ?? Number.POSITIVE_INFINITY) <= targetTs
    ) {
      dsIndex += 1;
    }

    const prev = deviceStatus[dsIndex];
    const next = deviceStatus[dsIndex + 1];
    const prevDistance = prev
      ? Math.abs(targetTs - prev.ts)
      : Number.POSITIVE_INFINITY;
    const nextDistance = next
      ? Math.abs(targetTs - next.ts)
      : Number.POSITIVE_INFINITY;
    const best = prevDistance <= nextDistance ? prev : next;

    if (!best || Math.min(prevDistance, nextDistance) > MAX_MATCH_DISTANCE_MS) {
      return sample;
    }

    const glucose = {...sample};
    // A matched report replaces its load context, including explicitly unknown fields.
    delete glucose.iob;
    delete glucose.iobBolus;
    delete glucose.iobBasal;
    delete glucose.cob;
    return {
      ...glucose,
      ...best.load,
    };
  });

  return isAscending ? enrichedAsc : enrichedAsc.reverse();
}
