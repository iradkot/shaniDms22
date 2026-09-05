import {buildTrendsEvidenceMetadata} from './evidence';
import type {TrendsGlucoseSample, TrendsPeriod} from './overview';
import {prepareTrendsSampleSet} from './sampleSet';
import type {
  ObservedAidModeSummary,
  TherapyContextSnapshot,
  TherapyContextSourceReliability,
} from './therapyContext';

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_EXPECTED_SAMPLE_INTERVAL_MS = 5 * 60 * 1000;
const MIN_MODE_EXPOSURE_MS = 6 * HOUR_MS;
const MIN_MODE_GLUCOSE_SAMPLES = 12;

export interface TherapyTreatmentFact {
  readonly timestampMs: number;
  readonly insulinUnits?: number;
  readonly carbohydrateGrams?: number;
}

export interface TherapyActivityFact {
  readonly startedAtMs: number;
  readonly endedAtMs?: number;
}

export interface TherapyModeChange {
  readonly timestampMs: number;
  readonly mode: 'open-loop' | 'closed-loop';
}

export interface BuildTherapyContextSnapshotInput {
  readonly period: TrendsPeriod;
  readonly glucoseSamples: readonly TrendsGlucoseSample[];
  readonly sourceReliability: TherapyContextSourceReliability;
  readonly treatments: readonly TherapyTreatmentFact[];
  readonly mealStartedAtMs: readonly number[];
  readonly activities: readonly TherapyActivityFact[];
  /** Include the most recent known change before period.startMs when available. */
  readonly modeChanges: readonly TherapyModeChange[];
  readonly expectedSampleIntervalMs?: number;
  readonly targetMinMgDl?: number;
  readonly targetMaxMgDl?: number;
  readonly timeZoneOffsetMinutes?: number;
}

const roundTo = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const positiveOrZero = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) && value > 0 ? value : 0;

const inPeriod = (timestampMs: number, period: TrendsPeriod): boolean =>
  Number.isFinite(timestampMs) &&
  timestampMs >= period.startMs &&
  timestampMs < period.endMs;

const normalizedModeChanges = (
  changes: readonly TherapyModeChange[],
  period: TrendsPeriod,
): readonly TherapyModeChange[] => {
  const byTimestamp = new Map<number, TherapyModeChange>();
  changes.forEach(change => {
    if (
      Number.isFinite(change.timestampMs) &&
      change.timestampMs <= period.endMs
    ) {
      byTimestamp.set(change.timestampMs, change);
    }
  });
  return [...byTimestamp.values()].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );
};

const lastChangeAtOrBefore = (
  changes: readonly TherapyModeChange[],
  timestampMs: number,
): TherapyModeChange | undefined => {
  let found: TherapyModeChange | undefined;
  for (const change of changes) {
    if (change.timestampMs > timestampMs) {
      break;
    }
    found = change;
  }
  return found;
};

interface ModeExposure {
  readonly openMs: number;
  readonly closedMs: number;
  readonly modeAt: (timestampMs: number) => TherapyModeChange['mode'] | undefined;
}

const buildModeExposure = (
  changes: readonly TherapyModeChange[],
  period: TrendsPeriod,
): ModeExposure => {
  const ordered = normalizedModeChanges(changes, period);
  let current = lastChangeAtOrBefore(ordered, period.startMs)?.mode;
  let cursor = period.startMs;
  let openMs = 0;
  let closedMs = 0;
  const accumulate = (endMs: number): void => {
    const durationMs = Math.max(0, endMs - cursor);
    if (current === 'open-loop') {
      openMs += durationMs;
    } else if (current === 'closed-loop') {
      closedMs += durationMs;
    }
    cursor = endMs;
  };
  ordered.forEach(change => {
    if (change.timestampMs <= period.startMs || change.timestampMs >= period.endMs) {
      return;
    }
    accumulate(change.timestampMs);
    current = change.mode;
  });
  accumulate(period.endMs);

  return {
    openMs,
    closedMs,
    modeAt: timestampMs => {
      if (!inPeriod(timestampMs, period)) {
        return undefined;
      }
      return lastChangeAtOrBefore(ordered, timestampMs)?.mode;
    },
  };
};

const observedModeSummaries = (input: {
  readonly exposure: ModeExposure;
  readonly samples: readonly TrendsGlucoseSample[];
  readonly targetMinMgDl: number;
  readonly targetMaxMgDl: number;
}): readonly ObservedAidModeSummary[] => {
  const exposureByMode = {
    'open-loop': input.exposure.openMs,
    'closed-loop': input.exposure.closedMs,
  } as const;
  const samplesByMode = {
    'open-loop': input.samples.filter(
      sample => input.exposure.modeAt(sample.timestampMs) === 'open-loop',
    ),
    'closed-loop': input.samples.filter(
      sample => input.exposure.modeAt(sample.timestampMs) === 'closed-loop',
    ),
  } as const;
  const modes = ['open-loop', 'closed-loop'] as const;
  const comparable = modes.every(
    mode =>
      exposureByMode[mode] >= MIN_MODE_EXPOSURE_MS &&
      samplesByMode[mode].length >= MIN_MODE_GLUCOSE_SAMPLES,
  );
  if (!comparable) {
    return [];
  }
  return modes.map(mode => {
    const samples = samplesByMode[mode];
    const inTarget = samples.filter(
      sample =>
        sample.valueMgDl >= input.targetMinMgDl &&
        sample.valueMgDl <= input.targetMaxMgDl,
    ).length;
    return {
      mode,
      observedHours: roundTo(exposureByMode[mode] / HOUR_MS, 1),
      targetRangePercent: roundTo((inTarget / samples.length) * 100, 1),
    };
  });
};

/**
 * Builds factual therapy context from already classified source facts.
 * It never infers a dose, treatment effect, or causal relationship.
 */
export const buildTherapyContextSnapshot = (
  input: BuildTherapyContextSnapshotInput,
): TherapyContextSnapshot => {
  const expectedSampleIntervalMs =
    input.expectedSampleIntervalMs ?? DEFAULT_EXPECTED_SAMPLE_INTERVAL_MS;
  const prepared = prepareTrendsSampleSet({
    period: input.period,
    samples: input.glucoseSamples,
    expectedSampleIntervalMs,
  });
  const targetMinMgDl = input.targetMinMgDl ?? 70;
  const targetMaxMgDl = input.targetMaxMgDl ?? 180;
  const timeZoneOffsetMinutes = input.timeZoneOffsetMinutes ?? 0;
  if (
    !Number.isFinite(targetMinMgDl) ||
    !Number.isFinite(targetMaxMgDl) ||
    targetMinMgDl <= 0 ||
    targetMaxMgDl <= targetMinMgDl
  ) {
    throw new Error('Therapy Context target range must be finite and ordered.');
  }
  if (
    !Number.isInteger(timeZoneOffsetMinutes) ||
    Math.abs(timeZoneOffsetMinutes) > 14 * 60
  ) {
    throw new Error(
      'Therapy Context time-zone offset must be a whole number of minutes between -840 and 840.',
    );
  }
  const daysWithData = new Set(
    prepared.validSamples.map(sample =>
      Math.floor(
        (sample.timestampMs + timeZoneOffsetMinutes * MINUTE_MS) / DAY_MS,
      ),
    ),
  ).size;
  const treatments = input.treatments.filter(treatment =>
    inPeriod(treatment.timestampMs, input.period),
  );
  const exposure = buildModeExposure(input.modeChanges, input.period);
  const periodDurationMs = input.period.endMs - input.period.startMs;
  const classifiedModeMs = exposure.openMs + exposure.closedMs;
  const activityMinutes = input.activities.reduce((total, activity) => {
    if (!Number.isFinite(activity.startedAtMs)) {
      return total;
    }
    const startMs = Math.max(input.period.startMs, activity.startedAtMs);
    const endMs = Math.min(
      input.period.endMs,
      activity.endedAtMs ?? input.period.endMs,
    );
    return total + Math.max(0, endMs - startMs) / 60_000;
  }, 0);

  return {
    period: input.period,
    quality: {
      sourceReliability: input.sourceReliability,
      coveragePercent: prepared.coveragePercent,
    },
    evidence: buildTrendsEvidenceMetadata({
      period: input.period,
      coveragePercent: prepared.coveragePercent,
      coverageQuality: prepared.coverageQuality,
      daysWithData,
      expectedSampleIntervalMs,
      lastReadingTimestampMs: prepared.lastReadingTimestampMs,
      targetRange: {minMgDl: targetMinMgDl, maxMgDl: targetMaxMgDl},
      timeZoneOffsetMinutes,
    }),
    totals: {
      insulinUnits: roundTo(
        treatments.reduce(
          (total, treatment) => total + positiveOrZero(treatment.insulinUnits),
          0,
        ),
      ),
      carbohydrateGrams: roundTo(
        treatments.reduce(
          (total, treatment) =>
            total + positiveOrZero(treatment.carbohydrateGrams),
          0,
        ),
      ),
      mealCount: input.mealStartedAtMs.filter(timestampMs =>
        inPeriod(timestampMs, input.period),
      ).length,
      activityMinutes: roundTo(activityMinutes, 1),
      aidAvailabilityPercent:
        classifiedModeMs === 0
          ? undefined
          : roundTo((classifiedModeMs / periodDurationMs) * 100, 1),
    },
    aidModes: observedModeSummaries({
      exposure,
      samples: prepared.validSamples,
      targetMinMgDl,
      targetMaxMgDl,
    }),
  };
};
