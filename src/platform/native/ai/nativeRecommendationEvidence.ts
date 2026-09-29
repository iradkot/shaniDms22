import {
  currentFactsExpireAtMs,
  reobserveCurrentData,
  type CurrentDataSnapshot,
} from '../../../modules/currentData';

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

/** Current observations and historical coverage are independent evidence. */
export const buildNativeRecommendationEvidence = (input: {
  readonly current: CurrentDataSnapshot;
  readonly stats: NativeRecommendationToolResult | undefined;
  readonly insulin: NativeRecommendationToolResult | undefined;
  readonly startMs: number;
  readonly endMs: number;
  readonly observedAtMs: number;
  readonly days: number;
}) => {
  const current = reobserveCurrentData(input.current, input.observedAtMs);
  const {glucose, iob, cob} = current;
  const latest =
    glucose.value !== null && glucose.sourceTimestampMs !== null
      ? {tMs: glucose.sourceTimestampMs, mgdl: glucose.value}
      : null;
  const currentIob = iob.status === 'fresh';
  const currentCob = cob.status === 'fresh';
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
    currentFactsExpireAtMs: currentFactsExpireAtMs(current),
    range: {
      start: new Date(input.startMs).toISOString(),
      end: new Date(input.endMs).toISOString(),
      days: input.days,
    },
    currentSnapshot: {
      fresh: glucose.status === 'fresh',
      latest,
      ageMinutes:
        glucose.ageMs === null ? null : Math.round(glucose.ageMs / 6000) / 10,
      observation: glucose,
      warning:
        glucose.status === 'fresh'
          ? null
          : 'No valid current glucose reading. Do not give immediate glucose or meal-timing advice.',
    },
    currentDeviceStatus: {
      available: currentIob || currentCob,
      fresh: currentIob && currentCob,
      iobU: currentIob ? iob.value : null,
      cobG: currentCob ? cob.value : null,
      iob: {...iob, value: currentIob ? iob.value : null},
      cob: {...cob, value: currentCob ? cob.value : null},
      warning:
        currentIob && currentCob
          ? null
          : 'Use only fields marked fresh. IOB and COB have independent source observation timestamps. Missing or stale values are unknown, never zero; fresh glucose does not verify their freshness.',
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
    note: 'The currentSnapshot and currentDeviceStatus are loaded independently of the selected historical period. Sparse or unavailable history does not invalidate a fresh current observation. Size is a patient description, not a carbohydrate estimate. Missing data is unknown, never zero. No causal or medical efficacy claims.',
  };
};
