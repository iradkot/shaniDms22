export interface LatestNightscoutSample {
  readonly sgv: number;
  readonly date?: number;
  readonly direction?: string;
  readonly iob?: number;
  readonly cob?: number;
  readonly staleLevel?: 'fresh' | 'stale' | 'very-stale';
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Validated display fields from the app-owned latest Nightscout snapshot. */
export const selectLatestNightscoutSample = (
  untrustedSnapshot: unknown,
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
  const iob = finiteNumber(enrichedBg.iob);
  const cob = finiteNumber(enrichedBg.cob);

  return {
    sgv,
    ...(date === undefined ? {} : {date}),
    ...(direction === undefined ? {} : {direction}),
    ...(iob === undefined ? {} : {iob}),
    ...(cob === undefined ? {} : {cob}),
    ...(staleLevel === undefined ? {} : {staleLevel}),
  };
};
