import {prepareTrendsSampleSet} from '../../trends';
import type {
  PreparedTrendsSampleSet,
  TrendsCoverageQuality,
  TrendsGlucoseSample,
  TrendsPeriod,
} from '../../trends';

export type GlucoseEventType = 'low' | 'high';

export class SimilarEventsInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SimilarEventsInputError';
  }
}

export interface SimilarEventsThresholds {
  readonly lowBelowMgDl: number;
  readonly highAboveMgDl: number;
}

export interface ObservedGlucoseEvent {
  readonly id: string;
  readonly type: GlucoseEventType;
  readonly startMs: number;
  readonly endMs: number;
  /** Nadir for a low event and peak for a high event. */
  readonly extremeMgDl: number;
  readonly extremeTimestampMs: number;
  readonly observedSpanMinutes: number;
  readonly sampleCount: number;
}

export interface SimilarEventMatch {
  readonly event: ObservedGlucoseEvent;
  /** Descriptive similarity only. This is not a medical or outcome score. */
  readonly scorePercent: number;
  readonly similarity: {
    readonly timeOfDayDifferenceMinutes: number;
    readonly extremeDifferenceMgDl: number;
    readonly observedSpanDifferenceMinutes: number;
    readonly components: SimilarityFormulaWeights;
  };
}

export interface SimilarityFormulaWeights {
  readonly timeOfDay: number;
  readonly extremeGlucose: number;
  readonly observedSpan: number;
}

export interface SimilarityFormula {
  readonly version: 'similar-glucose-events-v1';
  readonly weights: SimilarityFormulaWeights;
  readonly fullDifference: {
    readonly timeOfDayMinutes: 720;
    readonly extremeGlucoseMgDl: 100;
    readonly observedSpanMinutes: 180;
  };
}

export interface SimilarEventsAnalysisInput {
  readonly focusPeriod: TrendsPeriod;
  readonly historyPeriod: TrendsPeriod;
  readonly focalSamples: readonly TrendsGlucoseSample[];
  readonly historySamples: readonly TrendsGlucoseSample[];
  readonly expectedSampleIntervalMs: number;
  readonly thresholds: SimilarEventsThresholds;
  readonly timeZoneOffsetMinutes: number;
  readonly eventGapMs?: number;
}

export interface SimilarEventsAnalysis {
  readonly focusedEvent: ObservedGlucoseEvent | undefined;
  readonly matches: readonly SimilarEventMatch[];
  readonly formula: SimilarityFormula;
  readonly dataQuality: {
    readonly focus: SimilarEventsDataQuality;
    readonly history: SimilarEventsDataQuality;
    readonly requiresWarning: boolean;
  };
}

export interface SimilarEventsDataQuality {
  readonly validSampleCount: number;
  readonly excludedSampleCount: number;
  readonly duplicateSampleCount: number;
  readonly expectedSampleCount: number;
  readonly coveragePercent: number;
  readonly coverageQuality: TrendsCoverageQuality;
  readonly largestGapMs: number | undefined;
}

interface EventAccumulator {
  readonly type: GlucoseEventType;
  readonly samples: TrendsGlucoseSample[];
}

const MINUTE_MS = 60 * 1000;
const DAY_MS = 24 * 60 * MINUTE_MS;

export const SIMILARITY_FORMULA: SimilarityFormula = {
  version: 'similar-glucose-events-v1',
  weights: {timeOfDay: 0.4, extremeGlucose: 0.4, observedSpan: 0.2},
  fullDifference: {
    timeOfDayMinutes: 720,
    extremeGlucoseMgDl: 100,
    observedSpanMinutes: 180,
  },
};

const classify = (
  valueMgDl: number,
  thresholds: SimilarEventsThresholds,
): GlucoseEventType | undefined => {
  if (valueMgDl < thresholds.lowBelowMgDl) {
    return 'low';
  }
  if (valueMgDl > thresholds.highAboveMgDl) {
    return 'high';
  }
  return undefined;
};

const buildEvent = (accumulator: EventAccumulator): ObservedGlucoseEvent => {
  const first = accumulator.samples[0]!;
  const last = accumulator.samples[accumulator.samples.length - 1]!;
  const extreme = accumulator.samples.reduce((current, sample) => {
    if (accumulator.type === 'low') {
      return sample.valueMgDl < current.valueMgDl ? sample : current;
    }
    return sample.valueMgDl > current.valueMgDl ? sample : current;
  });
  return {
    id: `${accumulator.type}:${first.timestampMs}:${last.timestampMs}`,
    type: accumulator.type,
    startMs: first.timestampMs,
    endMs: last.timestampMs,
    extremeMgDl: extreme.valueMgDl,
    extremeTimestampMs: extreme.timestampMs,
    observedSpanMinutes: (last.timestampMs - first.timestampMs) / MINUTE_MS,
    sampleCount: accumulator.samples.length,
  };
};

const detectEvents = (
  samples: readonly TrendsGlucoseSample[],
  thresholds: SimilarEventsThresholds,
  eventGapMs: number,
): readonly ObservedGlucoseEvent[] => {
  const events: ObservedGlucoseEvent[] = [];
  let current: EventAccumulator | undefined;
  let previousTimestampMs: number | undefined;

  samples.forEach(sample => {
    const type = classify(sample.valueMgDl, thresholds);
    const gapBreak =
      previousTimestampMs !== undefined &&
      sample.timestampMs - previousTimestampMs > eventGapMs;
    if (gapBreak || type === undefined || current?.type !== type) {
      if (current) {
        events.push(buildEvent(current));
        current = undefined;
      }
    }
    if (type) {
      if (!current) {
        current = {type, samples: []};
      }
      current.samples.push(sample);
    }
    previousTimestampMs = sample.timestampMs;
  });
  if (current) {
    events.push(buildEvent(current));
  }
  return events;
};

const assertInput = (input: SimilarEventsAnalysisInput): void => {
  const {thresholds} = input;
  const validPeriod = (period: TrendsPeriod): boolean =>
    Number.isFinite(period.startMs) &&
    Number.isFinite(period.endMs) &&
    period.endMs > period.startMs;
  if (!validPeriod(input.focusPeriod) || !validPeriod(input.historyPeriod)) {
    throw new SimilarEventsInputError(
      'Similar Events requires increasing finite period boundaries.',
    );
  }
  if (input.historyPeriod.endMs > input.focusPeriod.startMs) {
    throw new SimilarEventsInputError(
      'The Similar Events history must end before the focused period starts.',
    );
  }
  if (
    !Number.isFinite(input.expectedSampleIntervalMs) ||
    input.expectedSampleIntervalMs <= 0
  ) {
    throw new SimilarEventsInputError(
      'Expected sample interval must be positive.',
    );
  }
  if (
    input.eventGapMs !== undefined &&
    (!Number.isFinite(input.eventGapMs) || input.eventGapMs <= 0)
  ) {
    throw new SimilarEventsInputError('Event gap must be positive.');
  }
  if (
    !Number.isFinite(thresholds.lowBelowMgDl) ||
    !Number.isFinite(thresholds.highAboveMgDl) ||
    thresholds.lowBelowMgDl <= 0 ||
    thresholds.highAboveMgDl <= thresholds.lowBelowMgDl
  ) {
    throw new SimilarEventsInputError(
      'Similar Events glucose thresholds must be positive and ordered.',
    );
  }
  if (
    !Number.isInteger(input.timeZoneOffsetMinutes) ||
    Math.abs(input.timeZoneOffsetMinutes) > 14 * 60
  ) {
    throw new SimilarEventsInputError(
      'Time-zone offset must be a whole number from -840 to 840 minutes.',
    );
  }
};

const distanceFromFocusCenter = (
  event: ObservedGlucoseEvent,
  focusPeriod: TrendsPeriod,
): number =>
  Math.abs(
    (event.startMs + event.endMs) / 2 -
      (focusPeriod.startMs + focusPeriod.endMs) / 2,
  );

const roundTo = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const localMinuteOfDay = (
  timestampMs: number,
  timeZoneOffsetMinutes: number,
): number => {
  const shifted = timestampMs + timeZoneOffsetMinutes * MINUTE_MS;
  return (((shifted % DAY_MS) + DAY_MS) % DAY_MS) / MINUTE_MS;
};

const clockDifferenceMinutes = (
  leftTimestampMs: number,
  rightTimestampMs: number,
  timeZoneOffsetMinutes: number,
): number => {
  const absolute = Math.abs(
    localMinuteOfDay(leftTimestampMs, timeZoneOffsetMinutes) -
      localMinuteOfDay(rightTimestampMs, timeZoneOffsetMinutes),
  );
  return Math.min(absolute, 24 * 60 - absolute);
};

const normalizedSimilarity = (difference: number, fullDifference: number): number =>
  Math.max(0, 1 - difference / fullDifference);

const scoreMatch = (
  focused: ObservedGlucoseEvent,
  candidate: ObservedGlucoseEvent,
  timeZoneOffsetMinutes: number,
): SimilarEventMatch => {
  const timeOfDayDifferenceMinutes = clockDifferenceMinutes(
    focused.startMs,
    candidate.startMs,
    timeZoneOffsetMinutes,
  );
  const extremeDifferenceMgDl = Math.abs(
    focused.extremeMgDl - candidate.extremeMgDl,
  );
  const observedSpanDifferenceMinutes = Math.abs(
    focused.observedSpanMinutes - candidate.observedSpanMinutes,
  );
  const components: SimilarityFormulaWeights = {
    timeOfDay: roundTo(
      normalizedSimilarity(
        timeOfDayDifferenceMinutes,
        SIMILARITY_FORMULA.fullDifference.timeOfDayMinutes,
      ),
      4,
    ),
    extremeGlucose: roundTo(
      normalizedSimilarity(
        extremeDifferenceMgDl,
        SIMILARITY_FORMULA.fullDifference.extremeGlucoseMgDl,
      ),
      4,
    ),
    observedSpan: roundTo(
      normalizedSimilarity(
        observedSpanDifferenceMinutes,
        SIMILARITY_FORMULA.fullDifference.observedSpanMinutes,
      ),
      4,
    ),
  };
  return {
    event: candidate,
    scorePercent: roundTo(
      (components.timeOfDay * SIMILARITY_FORMULA.weights.timeOfDay +
        components.extremeGlucose *
          SIMILARITY_FORMULA.weights.extremeGlucose +
        components.observedSpan *
          SIMILARITY_FORMULA.weights.observedSpan) *
        100,
    ),
    similarity: {
      timeOfDayDifferenceMinutes: roundTo(timeOfDayDifferenceMinutes),
      extremeDifferenceMgDl: roundTo(extremeDifferenceMgDl),
      observedSpanDifferenceMinutes: roundTo(observedSpanDifferenceMinutes),
      components,
    },
  };
};

const dataQuality = (
  prepared: PreparedTrendsSampleSet,
): SimilarEventsDataQuality => ({
  validSampleCount: prepared.validSampleCount,
  excludedSampleCount: prepared.excludedSampleCount,
  duplicateSampleCount: prepared.duplicateSampleCount,
  expectedSampleCount: prepared.expectedSampleCount,
  coveragePercent: prepared.coveragePercent,
  coverageQuality: prepared.coverageQuality,
  largestGapMs: prepared.largestGapMs,
});

/**
 * Finds threshold-defined glucose events. The input deliberately contains no
 * meal, carbohydrate, activity, or treatment records, so proximity cannot be
 * mistaken for a cause or used to merge separate events.
 */
export const analyzeSimilarGlucoseEvents = (
  input: SimilarEventsAnalysisInput,
): SimilarEventsAnalysis => {
  assertInput(input);
  const eventGapMs = input.eventGapMs ?? input.expectedSampleIntervalMs * 3;
  const focalSet = prepareTrendsSampleSet({
    period: input.focusPeriod,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    samples: input.focalSamples,
  });
  const historySet = prepareTrendsSampleSet({
    period: input.historyPeriod,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    samples: input.historySamples,
  });
  const focusedEvent = [...detectEvents(
    focalSet.validSamples,
    input.thresholds,
    eventGapMs,
  )].sort(
    (left, right) =>
      distanceFromFocusCenter(left, input.focusPeriod) -
        distanceFromFocusCenter(right, input.focusPeriod) ||
      left.startMs - right.startMs,
  )[0];
  const quality = {
    focus: dataQuality(focalSet),
    history: dataQuality(historySet),
    requiresWarning:
      focalSet.coverageQuality !== 'adequate' ||
      historySet.coverageQuality !== 'adequate',
  } as const;
  if (!focusedEvent) {
    return {
      focusedEvent: undefined,
      matches: [],
      formula: SIMILARITY_FORMULA,
      dataQuality: quality,
    };
  }
  return {
    focusedEvent,
    matches: detectEvents(
      historySet.validSamples,
      input.thresholds,
      eventGapMs,
    )
      .filter(event => event.type === focusedEvent.type)
      .map(event => scoreMatch(focusedEvent, event, input.timeZoneOffsetMinutes))
      .sort(
        (left, right) =>
          right.scorePercent - left.scorePercent ||
          right.event.startMs - left.event.startMs,
      ),
    formula: SIMILARITY_FORMULA,
    dataQuality: quality,
  };
};
