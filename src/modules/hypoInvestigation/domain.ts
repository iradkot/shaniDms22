import {
  prepareTrendsSampleSet,
  TrendsOverviewInputError,
} from '../trends';
import type {
  TrendsCoverageQuality,
  TrendsGlucoseSample,
  TrendsPeriod,
} from '../trends';

const MINUTE_MS = 60 * 1000;
const DEFAULT_EVENT_GAP_MS = 20 * MINUTE_MS;

export class HypoInvestigationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HypoInvestigationInputError';
  }
}

export type HypoEventSeverity = 'low' | 'very-low';

export interface HypoInvestigationEvent {
  readonly id: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly nadirTimestampMs: number;
  readonly nadirMgDl: number;
  readonly sampleCount: number;
  /** Observed sample-to-sample span. It is not an inferred clinical duration. */
  readonly observedSpanMinutes: number;
  readonly severity: HypoEventSeverity;
}

export interface HypoInvestigationResult {
  readonly period: TrendsPeriod;
  readonly thresholds: {
    readonly veryLowThresholdMgDl: number;
    readonly lowThresholdMgDl: number;
  };
  readonly events: readonly HypoInvestigationEvent[];
  readonly summary: {
    readonly eventCount: number;
    readonly veryLowEventCount: number;
    readonly lowReadingCount: number;
  };
  readonly dataQuality: {
    readonly validSampleCount: number;
    readonly excludedSampleCount: number;
    readonly duplicateSampleCount: number;
    readonly expectedSampleCount: number;
    readonly coveragePercent: number;
    readonly coverageQuality: TrendsCoverageQuality;
    readonly largestGapMs: number | undefined;
  };
}

export interface BuildHypoInvestigationInput {
  readonly period: TrendsPeriod;
  readonly samples: readonly TrendsGlucoseSample[];
  readonly expectedSampleIntervalMs: number;
  readonly veryLowThresholdMgDl: number;
  readonly lowThresholdMgDl: number;
  readonly eventGapMs?: number;
}

interface EventAccumulator {
  readonly samples: TrendsGlucoseSample[];
}

const roundTo = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const assertThresholds = (input: BuildHypoInvestigationInput): void => {
  if (
    !Number.isFinite(input.veryLowThresholdMgDl) ||
    !Number.isFinite(input.lowThresholdMgDl) ||
    input.veryLowThresholdMgDl <= 0 ||
    input.veryLowThresholdMgDl >= input.lowThresholdMgDl
  ) {
    throw new HypoInvestigationInputError(
      'Very-low and low thresholds must be finite, positive, and ordered.',
    );
  }
};

const toEvent = (
  accumulator: EventAccumulator,
  veryLowThresholdMgDl: number,
): HypoInvestigationEvent => {
  const first = accumulator.samples[0]!;
  const last = accumulator.samples[accumulator.samples.length - 1]!;
  const nadir = accumulator.samples.reduce((lowest, sample) =>
    sample.valueMgDl < lowest.valueMgDl ? sample : lowest,
  );

  return {
    id: `hypo:${first.timestampMs}`,
    startMs: first.timestampMs,
    endMs: last.timestampMs,
    nadirTimestampMs: nadir.timestampMs,
    nadirMgDl: nadir.valueMgDl,
    sampleCount: accumulator.samples.length,
    observedSpanMinutes: roundTo(
      (last.timestampMs - first.timestampMs) / MINUTE_MS,
      1,
    ),
    severity:
      nadir.valueMgDl < veryLowThresholdMgDl ? 'very-low' : 'low',
  };
};

/**
 * Builds factual low-glucose episodes from one integrity-checked sample set.
 * It intentionally does not infer a cause from nearby insulin or food data.
 */
export const buildHypoInvestigation = (
  input: BuildHypoInvestigationInput,
): HypoInvestigationResult => {
  assertThresholds(input);
  const eventGapMs = input.eventGapMs ?? DEFAULT_EVENT_GAP_MS;
  if (!Number.isFinite(eventGapMs) || eventGapMs <= 0) {
    throw new HypoInvestigationInputError(
      'The maximum gap inside an event must be positive.',
    );
  }

  let prepared;
  try {
    prepared = prepareTrendsSampleSet({
      period: input.period,
      samples: input.samples,
      expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    });
  } catch (error) {
    if (error instanceof TrendsOverviewInputError) {
      throw new HypoInvestigationInputError(error.message);
    }
    throw error;
  }

  const accumulators: EventAccumulator[] = [];
  let current: EventAccumulator | undefined;
  let previousTimestampMs: number | undefined;

  prepared.validSamples.forEach(sample => {
    const low = sample.valueMgDl < input.lowThresholdMgDl;
    const gapBreak =
      previousTimestampMs !== undefined &&
      sample.timestampMs - previousTimestampMs > eventGapMs;

    if (gapBreak || !low) {
      if (current) {
        accumulators.push(current);
        current = undefined;
      }
    }
    if (low) {
      if (!current) {
        current = {samples: []};
      }
      current.samples.push(sample);
    }
    previousTimestampMs = sample.timestampMs;
  });

  if (current) {
    accumulators.push(current);
  }

  const events = accumulators
    .map(accumulator =>
      toEvent(accumulator, input.veryLowThresholdMgDl),
    )
    .sort((left, right) => right.startMs - left.startMs);

  return {
    period: input.period,
    thresholds: {
      veryLowThresholdMgDl: input.veryLowThresholdMgDl,
      lowThresholdMgDl: input.lowThresholdMgDl,
    },
    events,
    summary: {
      eventCount: events.length,
      veryLowEventCount: events.filter(event => event.severity === 'very-low')
        .length,
      lowReadingCount: events.reduce(
        (total, event) => total + event.sampleCount,
        0,
      ),
    },
    dataQuality: {
      validSampleCount: prepared.validSampleCount,
      excludedSampleCount: prepared.excludedSampleCount,
      duplicateSampleCount: prepared.duplicateSampleCount,
      expectedSampleCount: prepared.expectedSampleCount,
      coveragePercent: prepared.coveragePercent,
      coverageQuality: prepared.coverageQuality,
      largestGapMs: prepared.largestGapMs,
    },
  };
};
