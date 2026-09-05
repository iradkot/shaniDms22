export type EventOutcomeKind = 'meal' | 'activity';

export interface EventOutcomeSubject {
  readonly kind: EventOutcomeKind;
  readonly id: string;
  readonly startedAtMs: number;
  readonly endedAtMs?: number;
}

export interface EventOutcomeGlucoseSample {
  readonly timestampMs: number;
  readonly valueMgDl: number;
}

export type EventOutcomeContextKind =
  | 'meal'
  | 'activity'
  | 'carbohydrate'
  | 'treatment';

export interface EventOutcomeContextEvent {
  readonly id: string;
  readonly kind: EventOutcomeContextKind;
  readonly timestampMs: number;
  readonly endTimestampMs?: number;
  readonly label?: string;
  /** Explicitly linked evidence can be shown without being treated as overlap. */
  readonly relatedToSubject?: boolean;
}

export type EventOutcomeQualityReason =
  | 'missing_baseline'
  | 'low_coverage'
  | 'large_data_gap'
  | 'overlapping_context'
  | 'activity_in_progress';

export interface EventOutcome {
  readonly subject: EventOutcomeSubject;
  readonly window: {
    readonly baselineStartMs: number;
    readonly subjectStartMs: number;
    readonly subjectEndMs: number;
    readonly observationEndMs: number;
  };
  readonly glucose: {
    readonly baselineMgDl: number | null;
    readonly peakMgDl: number | null;
    readonly peakTimestampMs: number | null;
    readonly nadirMgDl: number | null;
    readonly nadirTimestampMs: number | null;
    readonly oneHourMgDl: number | null;
    readonly twoHourMgDl: number | null;
    readonly peakRiseMgDl: number | null;
  };
  readonly advanced: {
    readonly mealIauc0To2h:
      | {
          readonly status: 'available';
          readonly valueMgDlHours: number;
          readonly formulaVersion: 'meal_iauc_positive_above_start_v1';
        }
      | {
          readonly status: 'unavailable';
          readonly reason:
            | 'not_meal'
            | 'missing_baseline'
            | 'insufficient_coverage';
        };
  };
  readonly quality: {
    readonly validSampleCount: number;
    readonly expectedSampleCount: number;
    readonly coveragePercent: number;
    readonly largestGapMs: number | null;
    readonly overlapCount: number;
    readonly overlappingContext: readonly EventOutcomeContextEvent[];
    readonly suitableForRepeatedObservation: boolean;
    readonly reasons: readonly EventOutcomeQualityReason[];
  };
}

export interface BuildEventOutcomeInput {
  readonly subject: EventOutcomeSubject;
  readonly glucoseSamples: readonly EventOutcomeGlucoseSample[];
  readonly contextEvents: readonly EventOutcomeContextEvent[];
  readonly expectedSampleIntervalMs: number;
  readonly baselineDurationMs?: number;
  readonly mealFollowUpDurationMs?: number;
  readonly activityFollowUpDurationMs?: number;
}

const HOUR_MS = 60 * 60 * 1000;
const DEFAULT_BASELINE_MS = 30 * 60 * 1000;
const DEFAULT_MEAL_FOLLOW_UP_MS = 3 * HOUR_MS;
const DEFAULT_ACTIVITY_FOLLOW_UP_MS = 2 * HOUR_MS;
const MINIMUM_COVERAGE_PERCENT = 70;

const round = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const finitePositive = (value: number): boolean =>
  Number.isFinite(value) && value > 0;

const median = (values: readonly number[]): number | null => {
  if (values.length === 0) {return null;}
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
};

const closestValue = (
  samples: readonly EventOutcomeGlucoseSample[],
  targetMs: number,
  toleranceMs: number,
): number | null => {
  let closest: EventOutcomeGlucoseSample | undefined;
  samples.forEach(sample => {
    if (Math.abs(sample.timestampMs - targetMs) > toleranceMs) {return;}
    if (
      closest === undefined ||
      Math.abs(sample.timestampMs - targetMs) <
        Math.abs(closest.timestampMs - targetMs)
    ) {
      closest = sample;
    }
  });
  return closest?.valueMgDl ?? null;
};

const integratePositiveArea = (
  samples: readonly EventOutcomeGlucoseSample[],
  baselineMgDl: number,
  startMs: number,
  endMs: number,
  maximumGapMs: number,
): number => {
  const points = samples.filter(
    sample => sample.timestampMs >= startMs && sample.timestampMs <= endMs,
  );
  let area = 0;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    const widthMs = right.timestampMs - left.timestampMs;
    if (widthMs <= 0 || widthMs > maximumGapMs) {continue;}
    const leftHeight = Math.max(0, left.valueMgDl - baselineMgDl);
    const rightHeight = Math.max(0, right.valueMgDl - baselineMgDl);
    area += ((leftHeight + rightHeight) / 2) * (widthMs / HOUR_MS);
  }
  return round(area);
};

const overlapsWindow = (
  event: EventOutcomeContextEvent,
  startMs: number,
  endMs: number,
): boolean => {
  const eventEnd = event.endTimestampMs ?? event.timestampMs;
  return event.timestampMs <= endMs && eventEnd >= startMs;
};

/**
 * Builds a descriptive outcome. It never assigns a grade or claims that the
 * Journal Entry caused the observed glucose response.
 */
export const buildEventOutcome = (
  input: BuildEventOutcomeInput,
): EventOutcome => {
  if (!finitePositive(input.expectedSampleIntervalMs)) {
    throw new Error('Event Outcome expected sample interval must be positive.');
  }
  if (
    !Number.isFinite(input.subject.startedAtMs) ||
    (input.subject.endedAtMs !== undefined &&
      (!Number.isFinite(input.subject.endedAtMs) ||
        input.subject.endedAtMs < input.subject.startedAtMs))
  ) {
    throw new Error('Event Outcome subject timing is invalid.');
  }

  const baselineDurationMs =
    input.baselineDurationMs ?? DEFAULT_BASELINE_MS;
  const activityInProgress =
    input.subject.kind === 'activity' && input.subject.endedAtMs === undefined;
  const subjectEndMs =
    input.subject.endedAtMs ?? input.subject.startedAtMs;
  const followUpMs =
    input.subject.kind === 'meal'
      ? input.mealFollowUpDurationMs ?? DEFAULT_MEAL_FOLLOW_UP_MS
      : input.activityFollowUpDurationMs ?? DEFAULT_ACTIVITY_FOLLOW_UP_MS;
  const baselineStartMs = input.subject.startedAtMs - baselineDurationMs;
  const observationEndMs = subjectEndMs + followUpMs;

  const byTimestamp = new Map<number, EventOutcomeGlucoseSample>();
  input.glucoseSamples.forEach(sample => {
    if (
      Number.isFinite(sample.timestampMs) &&
      finitePositive(sample.valueMgDl) &&
      sample.timestampMs >= baselineStartMs &&
      sample.timestampMs <= observationEndMs &&
      !byTimestamp.has(sample.timestampMs)
    ) {
      byTimestamp.set(sample.timestampMs, sample);
    }
  });
  const samples = [...byTimestamp.values()].sort(
    (left, right) => left.timestampMs - right.timestampMs,
  );
  const observationSamples = samples.filter(
    sample =>
      sample.timestampMs >= input.subject.startedAtMs &&
      sample.timestampMs <= observationEndMs,
  );
  const baselineSamples = samples.filter(
    sample =>
      sample.timestampMs >= baselineStartMs &&
      sample.timestampMs <= input.subject.startedAtMs,
  );
  const baselineMgDl = median(
    baselineSamples.map(sample => sample.valueMgDl),
  );
  const expectedSampleCount = Math.max(
    1,
    Math.floor(
      (observationEndMs - input.subject.startedAtMs) /
        input.expectedSampleIntervalMs,
    ) + 1,
  );
  const coveragePercent = round(
    Math.min(100, (observationSamples.length / expectedSampleCount) * 100),
  );

  let largestGapMs: number | null = null;
  if (observationSamples.length > 0) {
    largestGapMs = Math.max(
      0,
      observationSamples[0]!.timestampMs - input.subject.startedAtMs,
      observationEndMs -
        observationSamples[observationSamples.length - 1]!.timestampMs,
    );
    for (let index = 1; index < observationSamples.length; index += 1) {
      largestGapMs = Math.max(
        largestGapMs,
        observationSamples[index]!.timestampMs -
          observationSamples[index - 1]!.timestampMs,
      );
    }
  }

  const peak = observationSamples.reduce<
    EventOutcomeGlucoseSample | undefined
  >(
    (best, sample) =>
      best === undefined || sample.valueMgDl > best.valueMgDl ? sample : best,
    undefined,
  );
  const nadir = observationSamples.reduce<
    EventOutcomeGlucoseSample | undefined
  >(
    (best, sample) =>
      best === undefined || sample.valueMgDl < best.valueMgDl ? sample : best,
    undefined,
  );
  const overlappingContext = input.contextEvents.filter(
    event =>
      event.relatedToSubject !== true &&
      event.id !== input.subject.id &&
      overlapsWindow(event, input.subject.startedAtMs, observationEndMs),
  );
  const reasons: EventOutcomeQualityReason[] = [];
  if (baselineMgDl === null) {reasons.push('missing_baseline');}
  if (coveragePercent < MINIMUM_COVERAGE_PERCENT) {reasons.push('low_coverage');}
  if (
    largestGapMs !== null &&
    largestGapMs > input.expectedSampleIntervalMs * 3
  ) {
    reasons.push('large_data_gap');
  }
  if (overlappingContext.length > 0) {reasons.push('overlapping_context');}
  if (activityInProgress) {reasons.push('activity_in_progress');}

  const twoHourEndMs = input.subject.startedAtMs + 2 * HOUR_MS;
  const iaucExpectedSamples = Math.max(
    1,
    Math.floor((2 * HOUR_MS) / input.expectedSampleIntervalMs) + 1,
  );
  const iaucSamples = observationSamples.filter(
    sample => sample.timestampMs <= twoHourEndMs,
  );
  const iaucCoverage = (iaucSamples.length / iaucExpectedSamples) * 100;
  const iauc =
    input.subject.kind !== 'meal'
      ? ({status: 'unavailable', reason: 'not_meal'} as const)
      : baselineMgDl === null
      ? ({status: 'unavailable', reason: 'missing_baseline'} as const)
      : iaucCoverage < MINIMUM_COVERAGE_PERCENT ||
        (largestGapMs !== null &&
          largestGapMs > input.expectedSampleIntervalMs * 3)
      ? ({status: 'unavailable', reason: 'insufficient_coverage'} as const)
      : ({
          status: 'available',
          valueMgDlHours: integratePositiveArea(
            observationSamples,
            baselineMgDl,
            input.subject.startedAtMs,
            twoHourEndMs,
            input.expectedSampleIntervalMs * 3,
          ),
          formulaVersion: 'meal_iauc_positive_above_start_v1',
        } as const);

  return {
    subject: input.subject,
    window: {
      baselineStartMs,
      subjectStartMs: input.subject.startedAtMs,
      subjectEndMs,
      observationEndMs,
    },
    glucose: {
      baselineMgDl,
      peakMgDl: peak?.valueMgDl ?? null,
      peakTimestampMs: peak?.timestampMs ?? null,
      nadirMgDl: nadir?.valueMgDl ?? null,
      nadirTimestampMs: nadir?.timestampMs ?? null,
      oneHourMgDl: closestValue(
        observationSamples,
        input.subject.startedAtMs + HOUR_MS,
        input.expectedSampleIntervalMs * 2,
      ),
      twoHourMgDl: closestValue(
        observationSamples,
        twoHourEndMs,
        input.expectedSampleIntervalMs * 2,
      ),
      peakRiseMgDl:
        peak === undefined || baselineMgDl === null
          ? null
          : round(peak.valueMgDl - baselineMgDl),
    },
    advanced: {mealIauc0To2h: iauc},
    quality: {
      validSampleCount: observationSamples.length,
      expectedSampleCount,
      coveragePercent,
      largestGapMs,
      overlapCount: overlappingContext.length,
      overlappingContext,
      suitableForRepeatedObservation: reasons.length === 0,
      reasons,
    },
  };
};
