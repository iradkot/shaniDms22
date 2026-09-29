export type NativeRecommendationToolResult =
  | {readonly ok: true; readonly result: Record<string, unknown>}
  | {readonly ok: false; readonly error: string};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const availabilityValue = (value: unknown) =>
  value === 'available' || value === 'stale' || value === 'unavailable'
    ? value
    : 'unknown';

const availability = (value: unknown) => ({
  treatments: availabilityValue(isRecord(value) ? value.treatments : undefined),
  deviceStatus: availabilityValue(
    isRecord(value) ? value.deviceStatus : undefined,
  ),
  profile: availabilityValue(isRecord(value) ? value.profile : undefined),
});

/**
 * The legacy tool merges device values onto CGM timestamps. That merged time
 * does not establish when IOB/COB were observed, so they cannot be called current.
 */
export const buildNativeRecommendationEvidence = (input: {
  readonly cgm: NativeRecommendationToolResult | undefined;
  readonly stats: NativeRecommendationToolResult | undefined;
  readonly insulin: NativeRecommendationToolResult | undefined;
  readonly startMs: number;
  readonly endMs: number;
  readonly observedAtMs: number;
  readonly days: number;
}) => {
  const cgm = input.cgm?.ok ? input.cgm.result : undefined;
  const rawSamples = cgm && Array.isArray(cgm.samples) ? cgm.samples : [];
  const validSamples = rawSamples.flatMap((sample: unknown) => {
    if (
      !isRecord(sample) ||
      typeof sample.tMs !== 'number' ||
      !Number.isSafeInteger(sample.tMs) ||
      sample.tMs < 0 ||
      sample.tMs > input.observedAtMs ||
      typeof sample.mgdl !== 'number' ||
      !Number.isFinite(sample.mgdl) ||
      sample.mgdl <= 0
    ) {
      return [];
    }
    // Preserve only independently established CGM facts. In particular, do
    // not copy the merged sample's iobU/cobG into a current glucose snapshot.
    return [{tMs: sample.tMs, mgdl: sample.mgdl}];
  });
  const latest =
    validSamples.sort((left, right) => right.tMs - left.tMs)[0] ?? null;
  const ageMs = latest === null ? null : input.observedAtMs - latest.tMs;
  const current = ageMs !== null && ageMs <= 15 * 60_000;
  const cgmAvailability = availability(cgm?.availability);
  const stats = input.stats?.ok ? input.stats.result : undefined;
  const count =
    typeof stats?.sampleCount === 'number' &&
    Number.isSafeInteger(stats.sampleCount) &&
    stats.sampleCount > 0
      ? stats.sampleCount
      : 0;
  const expectedSamples = Math.max(
    1,
    (input.endMs - input.startMs) / (5 * 60_000),
  );
  const estimatedCoveragePct =
    Math.round(Math.min(100, (count / expectedSamples) * 100) * 10) / 10;
  const insulin = input.insulin?.ok ? input.insulin.result : undefined;
  const insulinAvailability = availability(insulin?.availability);
  const rawRecorded = insulin?.recordedInsulin;
  const recorded = isRecord(rawRecorded) ? rawRecorded : undefined;
  const knownUnits = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const treatmentsAvailable =
    insulin !== undefined &&
    insulinAvailability.treatments === 'available' &&
    recorded?.basalEvidence === 'recorded' &&
    recorded.basalEstimated !== true &&
    (recorded.quality === 'partial' || recorded.quality === 'available') &&
    (knownUnits(recorded.basalUnits) || knownUnits(recorded.bolusUnits));
  const rawTotals = insulin?.totals;
  const rawCounts = insulin?.counts;
  const bolusUnits = recorded?.bolusUnits;
  const carbsG = isRecord(rawTotals) ? rawTotals.carbsG : undefined;
  const carbTreatments = isRecord(rawCounts)
    ? rawCounts.carbTreatments
    : undefined;

  return {
    observedAt: new Date(input.observedAtMs).toISOString(),
    range: {
      start: new Date(input.startMs).toISOString(),
      end: new Date(input.endMs).toISOString(),
      days: input.days,
    },
    currentSnapshot: {
      fresh: current,
      latest,
      ageMinutes: ageMs === null ? null : Math.round(ageMs / 6000) / 10,
      invalidSampleCount: rawSamples.length - validSamples.length,
      sourceAvailability: cgmAvailability,
      warning: current
        ? null
        : 'No valid current glucose reading. Do not give immediate glucose or meal-timing advice.',
    },
    currentDeviceStatus: {
      available: false,
      fresh: false,
      sourceTimestampMs: null,
      iobU: null,
      cobG: null,
      sourceAvailability: cgmAvailability.deviceStatus,
      warning:
        'Current IOB and COB are unknown. The merged CGM tool does not expose their original device observation timestamp. A fresh glucose sample or a successful fetch does not verify device-value freshness.',
    },
    glucose:
      count > 0 && stats !== undefined
        ? {
            available: true,
            period: stats.period,
            sampleCount: count,
            estimatedCoveragePct,
            coverageAssumption:
              'Estimate assumes one CGM sample every five minutes; it does not prove continuous coverage.',
            timeOfDay: stats.timeOfDay,
            tirThresholdsUsed: stats.tirThresholdsUsed,
            stats: stats.stats,
            tir: stats.tir,
            events: stats.events,
            warning:
              estimatedCoveragePct < 70
                ? 'Sparse glucose evidence does not represent the whole requested period. Treat patterns and event counts as incomplete observations.'
                : null,
          }
        : {
            available: false,
            sampleCount: 0,
            warning:
              'No valid glucose samples are available for this period. Glucose metrics, time in range, and event counts are unknown, not zero.',
          },
    insulin: treatmentsAvailable
      ? {
          available: true,
          range: insulin.range,
          recordedInsulin: recorded,
          totals: {
            ...(knownUnits(bolusUnits) ? {bolusU: bolusUnits} : {}),
            ...(knownUnits(carbsG) ? {carbsG} : {}),
          },
          counts: {
            ...(knownUnits(carbTreatments) ? {carbTreatments} : {}),
          },
          availability: insulinAvailability,
          note: 'Recorded historical components are shown with their coverage. Missing components and a partial total remain unknown. These are not current insulin on board.',
        }
      : {
          available: false,
          availability: insulinAvailability,
          warning:
            'Treatment totals are unavailable or stale; do not interpret them as zero or as current insulin on board.',
        },
    note: 'Size is a patient description, not a carbohydrate estimate. Missing data is unknown, never zero. No causal or medical efficacy claims.',
  };
};
