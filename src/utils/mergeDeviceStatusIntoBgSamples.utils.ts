import {BgSample} from 'app/types/day_bgs.types';
import {DeviceStatusEntry} from 'app/types/deviceStatus.types';

/** Maximum allowed timestamp distance when matching BG↔deviceStatus. */
const MAX_MATCH_DISTANCE_MS = 10 * 60 * 1000;

const SORT_ORDER_CHECK_COUNT = 2;

function clampNonNegative(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return Math.max(0, value);
}

/**
 * Extracts the best-available timestamp in milliseconds for a deviceStatus entry.
 *
 * Loop values often include their own timestamps (aligned to computation time).
 * We prefer those when available.
 */
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
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof entry.loop?.cob?.timestamp === 'string') {
    const ms = Date.parse(entry.loop.cob.timestamp);
    if (Number.isFinite(ms)) return ms;
  }
  if (typeof entry.loop?.timestamp === 'string') {
    const ms = Date.parse(entry.loop.timestamp);
    if (Number.isFinite(ms)) return ms;
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
 * - Clamps negative values to 0
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
    clampNonNegative(entry.loop?.iob?.iob) ??
    clampNonNegative(entry.openaps?.iob?.iob) ??
    clampNonNegative(entry.iob);

  // Split IOB (if provided by source)
  const iobBolus =
    clampNonNegative(entry.loop?.iob?.bolusIob) ??
    clampNonNegative(entry.openaps?.iob?.bolusiob);
  const iobBasal =
    clampNonNegative(entry.loop?.iob?.basalIob) ??
    clampNonNegative(entry.openaps?.iob?.basaliob);

  // COB
  const cob =
    clampNonNegative(entry.loop?.cob?.cob) ??
    clampNonNegative(entry.openaps?.meal?.cob) ??
    clampNonNegative(entry.openaps?.cob?.cob) ??
    clampNonNegative(entry.cob);

  // If we only have total IOB, still provide a usable split.
  if (typeof iob === 'number' && (iobBolus == null || iobBasal == null)) {
    // Many setups only provide total IOB. Avoid inventing a basal/bolus split
    // (it makes consumers think basal IOB is really 0).
    return {iob, cob};
  }

  const total =
    (typeof iobBolus === 'number' ? iobBolus : 0) +
    (typeof iobBasal === 'number' ? iobBasal : 0);

  return {
    iob: typeof iob === 'number' ? iob : total > 0 ? total : undefined,
    iobBolus,
    iobBasal,
    cob,
  };
}

/**
 * Merges Loop/OpenAPS "load" values (IOB/COB) from device status into BG samples.
 *
 * Matching strategy:
 * - Build a timestamp-sorted deviceStatus list
 * - For each BG sample, pick the closest deviceStatus entry (prev/next)
 * - Only apply the match if the closest entry is within `MAX_MATCH_DISTANCE_MS`
 */
export function mergeDeviceStatusIntoBgSamples(params: {
  bgSamples: BgSample[];
  deviceStatus: DeviceStatusEntry[];
}): BgSample[] {
  const inputBgSamples = params.bgSamples;
  const deviceStatus = params.deviceStatus
    .map(s => ({s, ts: getDeviceStatusTimestampMs(s)}))
    .filter((x): x is {s: DeviceStatusEntry; ts: number} =>
      typeof x.ts === 'number',
    )
    .sort((a, b) => a.ts - b.ts);

  if (!deviceStatus.length) {
    return inputBgSamples;
  }

  // BG is usually sorted newest->oldest in this app; handle either order.
  const isAscending =
    inputBgSamples.length >= SORT_ORDER_CHECK_COUNT
      ? inputBgSamples[0].date < inputBgSamples[1].date
      : true;
  const ordered = isAscending ? inputBgSamples : [...inputBgSamples].reverse();

  let dsIndex = 0;

  const enrichedAsc = ordered.map(sample => {
    const targetTs = sample.date;

    // Advance to the last status with ts <= targetTs
    while (dsIndex + 1 < deviceStatus.length && deviceStatus[dsIndex + 1].ts <= targetTs) {
      dsIndex += 1;
    }

    const prev = deviceStatus[dsIndex];
    const next = deviceStatus[dsIndex + 1];
    const prevDistance = prev ? Math.abs(targetTs - prev.ts) : Number.POSITIVE_INFINITY;
    const nextDistance = next ? Math.abs(targetTs - next.ts) : Number.POSITIVE_INFINITY;
    const best = prevDistance <= nextDistance ? prev : next;

    if (!best || Math.min(prevDistance, nextDistance) > MAX_MATCH_DISTANCE_MS) {
      return sample;
    }

    const load = extractLoad(best.s);
    if (
      load.iob == null &&
      load.cob == null &&
      load.iobBolus == null &&
      load.iobBasal == null
    ) {
      return sample;
    }

    return {
      ...sample,
      ...load,
    };
  });

  return isAscending ? enrichedAsc : enrichedAsc.reverse();
}
