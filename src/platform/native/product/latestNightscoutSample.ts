import {
  reobserveCurrentData,
  type CurrentObservation,
} from '../../../modules/currentData';

export interface LatestNightscoutSample {
  readonly sgv: number;
  readonly date?: number;
  readonly direction?: string;
  readonly iob?: number;
  readonly cob?: number;
  readonly iobTimestampMs?: number;
  readonly cobTimestampMs?: number;
  readonly staleLevel?: 'fresh' | 'stale' | 'very-stale';
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readObservation = (value: unknown): CurrentObservation | undefined => {
  if (
    !isRecord(value) ||
    !['fresh', 'stale', 'unavailable'].includes(String(value.status)) ||
    (value.value !== null && finiteNumber(value.value) === undefined) ||
    (value.sourceTimestampMs !== null &&
      finiteNumber(value.sourceTimestampMs) === undefined) ||
    (value.fetchedAtMs !== null &&
      finiteNumber(value.fetchedAtMs) === undefined)
  ) {
    return undefined;
  }
  if (value.status !== 'unavailable' &&
      (value.value === null || value.sourceTimestampMs === null ||
       value.fetchedAtMs === null || Number(value.sourceTimestampMs) <= 0)) {
    return undefined;
  }
  return {
    status: value.status as CurrentObservation['status'],
    value: value.value as number | null,
    sourceTimestampMs: value.sourceTimestampMs as number | null,
    fetchedAtMs: value.fetchedAtMs as number | null,
    ageMs: finiteNumber(value.ageMs) ?? null,
    reason: typeof value.reason === 'string' ? value.reason : null,
  };
};

/** Re-age the source observations, including when no new network result arrives. */
export const selectCurrentObservations = (snapshot: unknown, nowMs: number) => {
  if (!isRecord(snapshot) || !isRecord(snapshot.currentData)) {
    return undefined;
  }
  const current = snapshot.currentData;
  const glucose = readObservation(current.glucose);
  const iob = readObservation(current.iob);
  const cob = readObservation(current.cob);
  if (!glucose || !iob || !cob) {
    return undefined;
  }
  return reobserveCurrentData(
    {
      observedAtMs: finiteNumber(current.observedAtMs) ?? nowMs,
      glucose,
      iob,
      cob,
      glucoseReading: null,
      deviceStatus: null,
    },
    nowMs,
  );
};

/** Validated display fields from the app-owned latest Nightscout snapshot. */
export const selectLatestNightscoutSample = (
  untrustedSnapshot: unknown,
  nowMs: number = Date.now(),
): LatestNightscoutSample | undefined => {
  if (!isRecord(untrustedSnapshot)) {
    return undefined;
  }
  const enrichedBg = untrustedSnapshot.enrichedBg;
  if (!isRecord(enrichedBg)) {
    return undefined;
  }
  const sgv = finiteNumber(enrichedBg.sgv);
  if (sgv === undefined) {
    return undefined;
  }

  const rawDirection = enrichedBg.direction;
  const direction = typeof rawDirection === 'string' ? rawDirection : undefined;
  const rawStaleLevel = untrustedSnapshot.staleLevel;
  const staleLevel =
    rawStaleLevel === 'fresh' ||
    rawStaleLevel === 'stale' ||
    rawStaleLevel === 'very-stale'
      ? rawStaleLevel
      : undefined;
  const date = finiteNumber(enrichedBg.date);
  const current = selectCurrentObservations(untrustedSnapshot, nowMs);
  if (current?.glucose.status === 'unavailable') {
    return undefined;
  }
  // Legacy enriched rows have no independent load clock and cannot prove freshness.
  const iob =
    current?.iob.status === 'fresh'
      ? current.iob.value ?? undefined
      : undefined;
  const cob =
    current?.cob.status === 'fresh'
      ? current.cob.value ?? undefined
      : undefined;

  return {
    sgv,
    ...(date === undefined ? {} : {date}),
    ...(direction === undefined ? {} : {direction}),
    ...(iob === undefined ? {} : {iob}),
    ...(cob === undefined ? {} : {cob}),
    ...(iob === undefined || current?.iob.sourceTimestampMs == null
      ? {}
      : {iobTimestampMs: current.iob.sourceTimestampMs}),
    ...(cob === undefined || current?.cob.sourceTimestampMs == null
      ? {}
      : {cobTimestampMs: current.cob.sourceTimestampMs}),
    ...(current?.glucose.status === 'stale'
      ? {staleLevel: 'very-stale' as const}
      : staleLevel === undefined
      ? {}
      : {staleLevel}),
  };
};
