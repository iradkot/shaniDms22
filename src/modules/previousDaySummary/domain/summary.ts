import type {
  TrendsCoverageQuality,
  TrendsPeriod,
  TrendsRangeThresholds,
} from '../../trends';
import {buildTrendsOverview, prepareTrendsSampleSet} from '../../trends';
import type {
  PreviousDaySummaryEvent,
  PreviousDaySummaryInsulinSource,
  PreviousDaySummarySourceSnapshot,
} from '../contracts';

export type PreviousDaySegmentKind = 'incoming-night' | 'day' | 'closing-night';

export interface PreviousDaySummarySegmentWindow {
  readonly kind: PreviousDaySegmentKind;
  /** The intended wall-clock segment, even while the closing night is partial. */
  readonly nominalPeriod: TrendsPeriod;
  /** The elapsed period that is safe to query and calculate. */
  readonly period: TrendsPeriod;
  readonly isPartial: boolean;
}

export interface PreviousDaySummaryWindow {
  readonly anchorDayStartMs: number;
  readonly nominalPeriod: TrendsPeriod;
  readonly period: TrendsPeriod;
  readonly isPartial: boolean;
  readonly segments: readonly [
    PreviousDaySummarySegmentWindow,
    PreviousDaySummarySegmentWindow,
    PreviousDaySummarySegmentWindow,
  ];
}

export interface PreviousDayCompactRanges {
  readonly lowPercent: number;
  readonly targetPercent: number;
  readonly highPercent: number;
}

export interface PreviousDayGlucoseMetrics {
  readonly period: TrendsPeriod;
  readonly validSampleCount: number;
  readonly excludedSampleCount: number;
  readonly duplicateSampleCount: number;
  readonly expectedSampleCount: number;
  readonly coveragePercent: number;
  readonly coverageQuality: TrendsCoverageQuality;
  readonly ranges: PreviousDayCompactRanges | undefined;
  readonly meanGlucoseMgDl: number | undefined;
}

export interface PreviousDaySegmentSummary extends PreviousDayGlucoseMetrics {
  readonly kind: PreviousDaySegmentKind;
  readonly nominalPeriod: TrendsPeriod;
  readonly isPartial: boolean;
  readonly events: readonly PreviousDaySummaryEvent[];
}

export type PreviousDayInsulinSummary =
  | {
      readonly quality: 'available';
      readonly basalUnits: number;
      readonly bolusUnits: number;
      readonly totalUnits: number;
    }
  | {readonly quality: 'unavailable'};

export interface PreviousDaySummary {
  readonly window: PreviousDaySummaryWindow;
  /**
   * The summary observes 30 wall-clock hours. Interpretation and comparison
   * start at 06:00 so the incoming night remains visible context and is not
   * counted in two adjacent retrospective days.
   */
  readonly evidence: PreviousDaySummaryEvidence;
  readonly overall: PreviousDayGlucoseMetrics;
  readonly segments: readonly [
    PreviousDaySegmentSummary,
    PreviousDaySegmentSummary,
    PreviousDaySegmentSummary,
  ];
  readonly insulinSummary: PreviousDayInsulinSummary;
  readonly events: readonly PreviousDaySummaryEvent[];
  readonly comparison: PreviousDayMatchedComparison;
  readonly mealOutcomes: readonly PreviousDayMealOutcome[];
  readonly insights: readonly PreviousDayInsight[];
  readonly suggestedFocus: PreviousDaySuggestedFocus;
}

export interface PreviousDaySummaryEvidence {
  readonly observedPeriod: TrendsPeriod;
  readonly interpretedPeriod: TrendsPeriod;
  readonly openingNightIsContextOnly: true;
  readonly closingNightComplete: boolean;
}

export interface PreviousDayComparisonDeltas {
  readonly meanGlucoseMgDl: number;
  readonly targetRangePercentagePoints: number;
  readonly lowRangePercentagePoints: number;
  readonly highRangePercentagePoints: number;
}

export type PreviousDayMatchedComparison =
  | {
      readonly status: 'available';
      readonly quality: 'adequate' | 'limited';
      readonly current: PreviousDayGlucoseMetrics;
      readonly reference: PreviousDayGlucoseMetrics;
      readonly deltas: PreviousDayComparisonDeltas;
    }
  | {
      readonly status: 'unavailable';
      readonly reason: 'missing-reference' | 'missing-glucose';
      readonly current: PreviousDayGlucoseMetrics;
      readonly reference?: PreviousDayGlucoseMetrics;
    };

interface PreviousDayMealOutcomeEvidence {
  readonly event: PreviousDaySummaryEvent;
  readonly observedPeriod: TrendsPeriod;
  readonly observationWindowMinutes: number;
  readonly windowComplete: boolean;
  readonly validSampleCount: number;
  readonly expectedSampleCount: number;
  readonly coveragePercent: number;
}

export type PreviousDayMealOutcome =
  | (PreviousDayMealOutcomeEvidence & {
      readonly status: 'available';
      readonly quality: 'adequate' | 'limited';
      readonly startGlucoseMgDl: number;
      readonly peakGlucoseMgDl: number;
      readonly endGlucoseMgDl: number;
      readonly observedPeakRiseMgDl: number;
      readonly observedEndChangeMgDl: number;
    })
  | (PreviousDayMealOutcomeEvidence & {
      readonly status: 'unavailable';
      readonly reason: 'missing-glucose';
    });

export type PreviousDayInsight =
  | {
      readonly kind: 'segment-low-observation';
      readonly segment: PreviousDaySegmentKind;
      readonly percentage: number;
    }
  | {
      readonly kind: 'segment-high-observation';
      readonly segment: PreviousDaySegmentKind;
      readonly percentage: number;
    }
  | {
      readonly kind: 'coverage-observation';
      readonly segment: PreviousDaySegmentKind;
      readonly coveragePercent: number;
    }
  | {
      readonly kind: 'matched-comparison-observation';
      readonly quality: 'adequate' | 'limited';
      readonly deltas: PreviousDayComparisonDeltas;
    }
  | {
      readonly kind: 'meal-outcome-observation';
      readonly availableCount: number;
      readonly totalCount: number;
    }
  | {readonly kind: 'closing-night-in-progress'};

export type PreviousDaySuggestedFocus =
  | {
      readonly kind: 'review-low-context';
      readonly segment: PreviousDaySegmentKind;
    }
  | {
      readonly kind: 'review-data-coverage';
      readonly segment: PreviousDaySegmentKind;
    }
  | {
      readonly kind: 'review-high-context';
      readonly segment: PreviousDaySegmentKind;
    }
  | {readonly kind: 'review-meal-observations'; readonly mealCount: number}
  | {readonly kind: 'review-matched-comparison'}
  | {readonly kind: 'review-summary-evidence'};

export interface BuildPreviousDaySummaryInput {
  readonly window: PreviousDaySummaryWindow;
  readonly expectedSampleIntervalMs: number;
  readonly thresholds: TrendsRangeThresholds;
  readonly source: PreviousDaySummarySourceSnapshot;
  readonly comparison?: {
    readonly window: PreviousDaySummaryWindow;
    readonly source: PreviousDaySummarySourceSnapshot;
  };
}

export interface GetPreviousDaySummaryWindowInput {
  readonly anchorDayStartMs: number;
  readonly nowMs: number;
  readonly calendar?: PreviousDayLocalCalendar;
}

/** Calendar seam keeps wall-clock boundaries testable across DST changes. */
export interface PreviousDayLocalCalendar {
  readonly startOfDay: (timestampMs: number) => number;
  readonly moveDays: (dayStartMs: number, dayDelta: number) => number;
  readonly atHour: (dayStartMs: number, hour: number) => number;
}

export class PreviousDaySummaryInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviousDaySummaryInputError';
  }
}

const roundTo = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const assertFiniteTimestamp = (value: number, label: string): void => {
  if (!Number.isFinite(value)) {
    throw new PreviousDaySummaryInputError(`${label} must be finite.`);
  }
};

const systemLocalCalendar: PreviousDayLocalCalendar = {
  startOfDay: timestampMs => {
    const value = new Date(timestampMs);
    value.setHours(0, 0, 0, 0);
    return value.getTime();
  },
  moveDays: (dayStartMs, dayDelta) => {
    const value = new Date(dayStartMs);
    value.setDate(value.getDate() + dayDelta);
    return value.getTime();
  },
  atHour: (dayStartMs, hour) => {
    const value = new Date(dayStartMs);
    value.setHours(hour, 0, 0, 0);
    return value.getTime();
  },
};

interface ZonedDateParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
}

const numericPart = (
  parts: readonly Intl.DateTimeFormatPart[],
  type: 'year' | 'month' | 'day' | 'hour',
): number => {
  const value = Number(parts.find(part => part.type === type)?.value);
  if (!Number.isFinite(value)) {
    throw new PreviousDaySummaryInputError(
      `Could not resolve the ${type} in the requested time zone.`,
    );
  }
  return value;
};

/**
 * Optional IANA-zone calendar for web/server hosts whose process timezone is
 * not the user's timezone. Native callers normally use the system calendar.
 */
export const createZonedPreviousDayCalendar = (
  timeZone: string,
): PreviousDayLocalCalendar => {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA-u-ca-iso8601-hc-h23-nu-latn', {
      day: '2-digit',
      hour: '2-digit',
      month: '2-digit',
      timeZone,
      year: 'numeric',
    });
  } catch {
    throw new PreviousDaySummaryInputError(
      `Unsupported IANA time zone: ${timeZone}`,
    );
  }

  const partsAt = (timestampMs: number): ZonedDateParts => {
    const parts = formatter.formatToParts(timestampMs);
    return {
      year: numericPart(parts, 'year'),
      month: numericPart(parts, 'month'),
      day: numericPart(parts, 'day'),
      hour: numericPart(parts, 'hour'),
    };
  };

  const epochAt = (parts: ZonedDateParts): number => {
    const targetAsUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
    );
    let candidate = targetAsUtc;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const observed = partsAt(candidate);
      const observedAsUtc = Date.UTC(
        observed.year,
        observed.month - 1,
        observed.day,
        observed.hour,
      );
      const correction = targetAsUtc - observedAsUtc;
      if (correction === 0) {
        return candidate;
      }
      candidate += correction;
    }
    throw new PreviousDaySummaryInputError(
      'Could not resolve the requested local time in this IANA time zone.',
    );
  };

  const movedDateParts = (
    dayStartMs: number,
    dayDelta: number,
  ): ZonedDateParts => {
    const source = partsAt(dayStartMs);
    const moved = new Date(
      Date.UTC(source.year, source.month - 1, source.day + dayDelta),
    );
    return {
      year: moved.getUTCFullYear(),
      month: moved.getUTCMonth() + 1,
      day: moved.getUTCDate(),
      hour: 0,
    };
  };

  return {
    startOfDay: timestampMs => {
      const source = partsAt(timestampMs);
      return epochAt({...source, hour: 0});
    },
    moveDays: (dayStartMs, dayDelta) =>
      epochAt(movedDateParts(dayStartMs, dayDelta)),
    atHour: (dayStartMs, hour) => {
      if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
        throw new PreviousDaySummaryInputError(
          'Local summary hour must be a whole hour from 0 through 23.',
        );
      }
      const source = partsAt(dayStartMs);
      return epochAt({...source, hour});
    },
  };
};

export const previousDayLocalStart = (
  timestampMs: number,
  calendar: PreviousDayLocalCalendar = systemLocalCalendar,
): number => {
  assertFiniteTimestamp(timestampMs, 'Timestamp');
  return calendar.startOfDay(timestampMs);
};

export const movePreviousDayAnchor = (
  anchorDayStartMs: number,
  dayDelta: number,
  calendar: PreviousDayLocalCalendar = systemLocalCalendar,
): number => {
  assertFiniteTimestamp(anchorDayStartMs, 'Anchor');
  if (!Number.isInteger(dayDelta)) {
    throw new PreviousDaySummaryInputError(
      'Summary day movement must be a whole number.',
    );
  }
  return calendar.moveDays(
    previousDayLocalStart(anchorDayStartMs, calendar),
    dayDelta,
  );
};

export const getLatestPreviousDayAnchor = (
  nowMs: number,
  calendar: PreviousDayLocalCalendar = systemLocalCalendar,
): number =>
  movePreviousDayAnchor(previousDayLocalStart(nowMs, calendar), -1, calendar);

export const getPreviousDaySummaryWindow = (
  input: GetPreviousDaySummaryWindowInput,
): PreviousDaySummaryWindow => {
  assertFiniteTimestamp(input.anchorDayStartMs, 'Anchor');
  assertFiniteTimestamp(input.nowMs, 'Current time');
  const calendar = input.calendar ?? systemLocalCalendar;
  const normalizedAnchor = previousDayLocalStart(
    input.anchorDayStartMs,
    calendar,
  );
  if (normalizedAnchor !== input.anchorDayStartMs) {
    throw new PreviousDaySummaryInputError(
      'Previous Day Summary anchor must be local midnight.',
    );
  }
  if (normalizedAnchor > getLatestPreviousDayAnchor(input.nowMs, calendar)) {
    throw new PreviousDaySummaryInputError(
      'Previous Day Summary cannot use a current or future day anchor.',
    );
  }

  const incomingEndMs = calendar.atHour(normalizedAnchor, 6);
  const dayEndMs = calendar.atHour(normalizedAnchor, 22);
  const followingDayStartMs = movePreviousDayAnchor(
    normalizedAnchor,
    1,
    calendar,
  );
  const nominalEndMs = calendar.atHour(followingDayStartMs, 6);
  const effectiveEndMs = Math.min(nominalEndMs, input.nowMs);
  const closingPartial = effectiveEndMs < nominalEndMs;

  const incomingNight: PreviousDaySummarySegmentWindow = {
    kind: 'incoming-night',
    nominalPeriod: {startMs: normalizedAnchor, endMs: incomingEndMs},
    period: {startMs: normalizedAnchor, endMs: incomingEndMs},
    isPartial: false,
  };
  const day: PreviousDaySummarySegmentWindow = {
    kind: 'day',
    nominalPeriod: {startMs: incomingEndMs, endMs: dayEndMs},
    period: {startMs: incomingEndMs, endMs: dayEndMs},
    isPartial: false,
  };
  const closingNight: PreviousDaySummarySegmentWindow = {
    kind: 'closing-night',
    nominalPeriod: {startMs: dayEndMs, endMs: nominalEndMs},
    period: {startMs: dayEndMs, endMs: effectiveEndMs},
    isPartial: closingPartial,
  };

  return {
    anchorDayStartMs: normalizedAnchor,
    nominalPeriod: {startMs: normalizedAnchor, endMs: nominalEndMs},
    period: {startMs: normalizedAnchor, endMs: effectiveEndMs},
    isPartial: closingPartial,
    segments: [incomingNight, day, closingNight],
  };
};

const compactRanges = (
  overview: ReturnType<typeof buildTrendsOverview>,
): PreviousDayCompactRanges | undefined =>
  overview.ranges
    ? {
        lowPercent: roundTo(
          overview.ranges.veryLowPercent + overview.ranges.lowPercent,
        ),
        targetPercent: overview.ranges.targetPercent,
        highPercent: roundTo(
          overview.ranges.highPercent + overview.ranges.veryHighPercent,
        ),
      }
    : undefined;

const buildGlucoseMetrics = (input: {
  readonly period: TrendsPeriod;
  readonly expectedSampleIntervalMs: number;
  readonly thresholds: TrendsRangeThresholds;
  readonly samples: PreviousDaySummarySourceSnapshot['glucoseSamples'];
}): PreviousDayGlucoseMetrics => {
  const overview = buildTrendsOverview({
    period: input.period,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    thresholds: input.thresholds,
    samples: input.samples,
  });
  return {
    period: input.period,
    validSampleCount: overview.validSampleCount,
    excludedSampleCount: overview.excludedSampleCount,
    duplicateSampleCount: overview.duplicateSampleCount,
    expectedSampleCount: overview.expectedSampleCount,
    coveragePercent: overview.coveragePercent,
    coverageQuality: overview.coverageQuality,
    ranges: compactRanges(overview),
    meanGlucoseMgDl: overview.meanGlucoseMgDl,
  };
};

const buildInsulinSummary = (
  source: PreviousDaySummaryInsulinSource,
): PreviousDayInsulinSummary => {
  if (source.quality === 'unavailable') {
    return {quality: 'unavailable'};
  }
  if (
    !Number.isFinite(source.basalUnits) ||
    !Number.isFinite(source.bolusUnits) ||
    source.basalUnits < 0 ||
    source.bolusUnits < 0
  ) {
    throw new PreviousDaySummaryInputError(
      'Authoritative insulin totals must be finite and non-negative.',
    );
  }
  return {
    quality: 'available',
    basalUnits: source.basalUnits,
    bolusUnits: source.bolusUnits,
    totalUnits: roundTo(source.basalUnits + source.bolusUnits),
  };
};

const interpretedPeriod = (
  window: PreviousDaySummaryWindow,
): TrendsPeriod => ({
  startMs: window.segments[1].period.startMs,
  endMs: window.period.endMs,
});

const buildMatchedComparison = (input: {
  readonly window: PreviousDaySummaryWindow;
  readonly expectedSampleIntervalMs: number;
  readonly thresholds: TrendsRangeThresholds;
  readonly source: PreviousDaySummarySourceSnapshot;
  readonly comparison: BuildPreviousDaySummaryInput['comparison'];
}): PreviousDayMatchedComparison => {
  const currentPeriod = interpretedPeriod(input.window);
  const current = buildGlucoseMetrics({
    period: currentPeriod,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    thresholds: input.thresholds,
    samples: input.source.glucoseSamples,
  });
  if (!input.comparison) {
    return {status: 'unavailable', reason: 'missing-reference', current};
  }

  const durationMs = currentPeriod.endMs - currentPeriod.startMs;
  const referenceStartMs = input.comparison.window.segments[1].period.startMs;
  const reference = buildGlucoseMetrics({
    period: {
      startMs: referenceStartMs,
      endMs: referenceStartMs + durationMs,
    },
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    thresholds: input.thresholds,
    samples: input.comparison.source.glucoseSamples,
  });
  if (
    !current.ranges ||
    current.meanGlucoseMgDl === undefined ||
    !reference.ranges ||
    reference.meanGlucoseMgDl === undefined
  ) {
    return {
      status: 'unavailable',
      reason: 'missing-glucose',
      current,
      reference,
    };
  }

  return {
    status: 'available',
    quality:
      current.coverageQuality === 'adequate' &&
      reference.coverageQuality === 'adequate'
        ? 'adequate'
        : 'limited',
    current,
    reference,
    deltas: {
      meanGlucoseMgDl: roundTo(
        current.meanGlucoseMgDl - reference.meanGlucoseMgDl,
      ),
      targetRangePercentagePoints: roundTo(
        current.ranges.targetPercent - reference.ranges.targetPercent,
      ),
      lowRangePercentagePoints: roundTo(
        current.ranges.lowPercent - reference.ranges.lowPercent,
      ),
      highRangePercentagePoints: roundTo(
        current.ranges.highPercent - reference.ranges.highPercent,
      ),
    },
  };
};

const eventKey = (event: PreviousDaySummaryEvent): string =>
  `${event.kind}:${event.id}`;

const normalizeEvents = (
  events: readonly PreviousDaySummaryEvent[],
  period: TrendsPeriod,
): readonly PreviousDaySummaryEvent[] => {
  const seen = new Set<string>();
  return events
    .filter(event => {
      const key = eventKey(event);
      const valid =
        event.id.trim().length > 0 &&
        event.title.trim().length > 0 &&
        Number.isFinite(event.timestampMs) &&
        event.timestampMs >= period.startMs &&
        event.timestampMs < period.endMs &&
        !seen.has(key);
      if (valid) {
        seen.add(key);
      }
      return valid;
    })
    .slice()
    .sort(
      (left, right) =>
        left.timestampMs - right.timestampMs ||
        eventKey(left).localeCompare(eventKey(right)),
    );
};

const eventsInPeriod = (
  events: readonly PreviousDaySummaryEvent[],
  period: TrendsPeriod,
): readonly PreviousDaySummaryEvent[] =>
  events.filter(
    event =>
      event.timestampMs >= period.startMs && event.timestampMs < period.endMs,
  );

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

const buildMealOutcomes = (input: {
  readonly events: readonly PreviousDaySummaryEvent[];
  readonly source: PreviousDaySummarySourceSnapshot;
  readonly window: PreviousDaySummaryWindow;
  readonly expectedSampleIntervalMs: number;
}): readonly PreviousDayMealOutcome[] =>
  input.events
    .filter(event => event.kind === 'meal')
    .map(event => {
      const intendedEndMs = event.timestampMs + TWO_HOURS_MS;
      const observedPeriod = {
        startMs: event.timestampMs,
        endMs: Math.min(intendedEndMs, input.window.period.endMs),
      };
      const prepared = prepareTrendsSampleSet({
        period: observedPeriod,
        expectedSampleIntervalMs: input.expectedSampleIntervalMs,
        samples: input.source.glucoseSamples,
      });
      const evidence: PreviousDayMealOutcomeEvidence = {
        event,
        observedPeriod,
        observationWindowMinutes: roundTo(
          (observedPeriod.endMs - observedPeriod.startMs) / (60 * 1000),
          0,
        ),
        windowComplete: observedPeriod.endMs === intendedEndMs,
        validSampleCount: prepared.validSampleCount,
        expectedSampleCount: prepared.expectedSampleCount,
        coveragePercent: prepared.coveragePercent,
      };
      if (prepared.validSamples.length === 0) {
        return {
          ...evidence,
          status: 'unavailable' as const,
          reason: 'missing-glucose' as const,
        };
      }
      const startGlucoseMgDl = prepared.validSamples[0]!.valueMgDl;
      const endGlucoseMgDl =
        prepared.validSamples[prepared.validSamples.length - 1]!.valueMgDl;
      const peakGlucoseMgDl = Math.max(...prepared.valuesMgDl);
      return {
        ...evidence,
        status: 'available' as const,
        quality:
          evidence.windowComplete && prepared.coverageQuality === 'adequate'
            ? ('adequate' as const)
            : ('limited' as const),
        startGlucoseMgDl,
        peakGlucoseMgDl,
        endGlucoseMgDl,
        observedPeakRiseMgDl: roundTo(peakGlucoseMgDl - startGlucoseMgDl),
        observedEndChangeMgDl: roundTo(endGlucoseMgDl - startGlucoseMgDl),
      };
    });

const maxSegmentBy = (
  segments: PreviousDaySummary['segments'],
  value: (segment: PreviousDaySegmentSummary) => number,
): PreviousDaySegmentSummary =>
  segments.reduce((highest, segment) =>
    value(segment) > value(highest) ? segment : highest,
  );

const buildInsights = (input: {
  readonly window: PreviousDaySummaryWindow;
  readonly segments: PreviousDaySummary['segments'];
  readonly comparison: PreviousDayMatchedComparison;
  readonly mealOutcomes: readonly PreviousDayMealOutcome[];
}): readonly PreviousDayInsight[] => {
  const insights: PreviousDayInsight[] = [];
  if (input.window.isPartial) {
    insights.push({kind: 'closing-night-in-progress'});
  }
  const lowestCoverage = maxSegmentBy(
    input.segments,
    segment => 100 - segment.coveragePercent,
  );
  if (lowestCoverage.coverageQuality !== 'adequate') {
    insights.push({
      kind: 'coverage-observation',
      segment: lowestCoverage.kind,
      coveragePercent: lowestCoverage.coveragePercent,
    });
  }
  const mostLow = maxSegmentBy(
    input.segments,
    segment => segment.ranges?.lowPercent ?? 0,
  );
  if ((mostLow.ranges?.lowPercent ?? 0) > 0) {
    insights.push({
      kind: 'segment-low-observation',
      segment: mostLow.kind,
      percentage: mostLow.ranges!.lowPercent,
    });
  }
  const mostHigh = maxSegmentBy(
    input.segments,
    segment => segment.ranges?.highPercent ?? 0,
  );
  if ((mostHigh.ranges?.highPercent ?? 0) > 0) {
    insights.push({
      kind: 'segment-high-observation',
      segment: mostHigh.kind,
      percentage: mostHigh.ranges!.highPercent,
    });
  }
  if (input.comparison.status === 'available') {
    insights.push({
      kind: 'matched-comparison-observation',
      quality: input.comparison.quality,
      deltas: input.comparison.deltas,
    });
  }
  if (input.mealOutcomes.length > 0) {
    insights.push({
      kind: 'meal-outcome-observation',
      availableCount: input.mealOutcomes.filter(
        outcome => outcome.status === 'available',
      ).length,
      totalCount: input.mealOutcomes.length,
    });
  }
  return insights;
};

const buildSuggestedFocus = (input: {
  readonly segments: PreviousDaySummary['segments'];
  readonly comparison: PreviousDayMatchedComparison;
  readonly mealOutcomes: readonly PreviousDayMealOutcome[];
}): PreviousDaySuggestedFocus => {
  const mostLow = maxSegmentBy(
    input.segments,
    segment => segment.ranges?.lowPercent ?? 0,
  );
  if ((mostLow.ranges?.lowPercent ?? 0) > 0) {
    return {kind: 'review-low-context', segment: mostLow.kind};
  }
  const lowestCoverage = maxSegmentBy(
    input.segments,
    segment => 100 - segment.coveragePercent,
  );
  if (lowestCoverage.coverageQuality !== 'adequate') {
    return {kind: 'review-data-coverage', segment: lowestCoverage.kind};
  }
  const mostHigh = maxSegmentBy(
    input.segments,
    segment => segment.ranges?.highPercent ?? 0,
  );
  if ((mostHigh.ranges?.highPercent ?? 0) > 0) {
    return {kind: 'review-high-context', segment: mostHigh.kind};
  }
  const availableMeals = input.mealOutcomes.filter(
    outcome => outcome.status === 'available',
  ).length;
  if (availableMeals > 0) {
    return {kind: 'review-meal-observations', mealCount: availableMeals};
  }
  if (input.comparison.status === 'available') {
    return {kind: 'review-matched-comparison'};
  }
  return {kind: 'review-summary-evidence'};
};

/**
 * Builds one factual prior-day summary without scores, predictions, or
 * treatment advice. Every glucose segment passes through the Trends integrity
 * boundary, and future closing-night time is excluded before loading.
 */
export const buildPreviousDaySummary = (
  input: BuildPreviousDaySummaryInput,
): PreviousDaySummary => {
  const events = normalizeEvents(input.source.events, input.window.period);
  const overall = buildGlucoseMetrics({
    period: input.window.period,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    thresholds: input.thresholds,
    samples: input.source.glucoseSamples,
  });
  const buildSegment = (
    segment: PreviousDaySummarySegmentWindow,
  ): PreviousDaySegmentSummary => ({
    ...buildGlucoseMetrics({
      period: segment.period,
      expectedSampleIntervalMs: input.expectedSampleIntervalMs,
      thresholds: input.thresholds,
      samples: input.source.glucoseSamples,
    }),
    kind: segment.kind,
    nominalPeriod: segment.nominalPeriod,
    isPartial: segment.isPartial,
    events: eventsInPeriod(events, segment.period),
  });
  const segments = [
    buildSegment(input.window.segments[0]),
    buildSegment(input.window.segments[1]),
    buildSegment(input.window.segments[2]),
  ] as const;
  const comparison = buildMatchedComparison({
    window: input.window,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
    thresholds: input.thresholds,
    source: input.source,
    comparison: input.comparison,
  });
  const mealOutcomes = buildMealOutcomes({
    events,
    source: input.source,
    window: input.window,
    expectedSampleIntervalMs: input.expectedSampleIntervalMs,
  });
  const insights = buildInsights({
    window: input.window,
    segments,
    comparison,
    mealOutcomes,
  });

  return {
    window: input.window,
    evidence: {
      observedPeriod: input.window.period,
      interpretedPeriod: interpretedPeriod(input.window),
      openingNightIsContextOnly: true,
      closingNightComplete: !input.window.isPartial,
    },
    overall,
    segments,
    insulinSummary: buildInsulinSummary(input.source.insulinSummary),
    events,
    comparison,
    mealOutcomes,
    insights,
    suggestedFocus: buildSuggestedFocus({
      segments,
      comparison,
      mealOutcomes,
    }),
  };
};
