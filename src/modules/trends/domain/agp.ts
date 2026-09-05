import {
  TrendsOverviewInputError,
  prepareTrendsSampleSet,
} from './sampleSet';
import type {
  TrendsCoverageQuality,
  TrendsDurationQuality,
  TrendsGlucoseSample,
  TrendsInterpretationQuality,
  TrendsPeriod,
} from './overview';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

export interface AgpHourBucket {
  readonly hour: number;
  readonly sampleCount: number;
  readonly p10MgDl: number | undefined;
  readonly p25MgDl: number | undefined;
  readonly medianMgDl: number | undefined;
  readonly p75MgDl: number | undefined;
  readonly p90MgDl: number | undefined;
}

export interface AgpDataQuality {
  readonly validSampleCount: number;
  readonly excludedSampleCount: number;
  readonly duplicateSampleCount: number;
  readonly expectedSampleCount: number;
  readonly coveragePercent: number;
  readonly coverageQuality: TrendsCoverageQuality;
  readonly durationQuality: TrendsDurationQuality;
  readonly interpretationQuality: TrendsInterpretationQuality;
  readonly daysWithData: number;
  readonly largestGapMs: number | undefined;
  readonly lastReadingTimestampMs: number | undefined;
}

export interface AgpProfile {
  readonly period: TrendsPeriod;
  /** Fixed UTC offset used to assign each reading to a local clock hour. */
  readonly timeZoneOffsetMinutes: number;
  readonly quality: AgpDataQuality;
  readonly buckets: readonly AgpHourBucket[];
  /** Every local calendar day remains inspectable, including days with no data. */
  readonly dailyProfiles: readonly AgpDailyProfile[];
}

export interface AgpDailyPoint {
  readonly timestampMs: number;
  readonly minuteOfDay: number;
  readonly valueMgDl: number;
}

export interface AgpDailyProfile {
  /** Absolute start/end of the local calendar day represented by this row. */
  readonly dayStartMs: number;
  readonly dayEndMs: number;
  readonly sampleCount: number;
  readonly expectedSampleCount: number;
  readonly coveragePercent: number;
  readonly coverageQuality: TrendsCoverageQuality;
  /** Includes visible leading/trailing gaps inside the selected period. */
  readonly largestGapMs: number;
  readonly points: readonly AgpDailyPoint[];
}

export interface BuildAgpProfileInput {
  readonly period: TrendsPeriod;
  readonly expectedSampleIntervalMs: number;
  readonly timeZoneOffsetMinutes: number;
  readonly samples: readonly TrendsGlucoseSample[];
}

const roundTo = (value: number, digits = 2): number => {
  const multiplier = 10 ** digits;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
};

const percentile = (
  sortedValues: readonly number[],
  quantile: number,
): number => {
  const position = (sortedValues.length - 1) * quantile;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  const lowerValue = sortedValues[lowerIndex]!;
  const upperValue = sortedValues[upperIndex]!;
  return roundTo(
    lowerValue + (upperValue - lowerValue) * (position - lowerIndex),
  );
};

const localTimestamp = (
  timestampMs: number,
  timeZoneOffsetMinutes: number,
): number => timestampMs + timeZoneOffsetMinutes * MINUTE_MS;

const localHour = (
  timestampMs: number,
  timeZoneOffsetMinutes: number,
): number => {
  const localTimeOfDay =
    ((localTimestamp(timestampMs, timeZoneOffsetMinutes) % DAY_MS) + DAY_MS) %
    DAY_MS;
  return Math.floor(localTimeOfDay / HOUR_MS);
};

const dailyProfiles = (
  input: BuildAgpProfileInput,
  validSamples: readonly TrendsGlucoseSample[],
): readonly AgpDailyProfile[] => {
  const offsetMs = input.timeZoneOffsetMinutes * MINUTE_MS;
  const firstDayIndex = Math.floor((input.period.startMs + offsetMs) / DAY_MS);
  const lastDayIndex = Math.floor(
    (input.period.endMs - 1 + offsetMs) / DAY_MS,
  );

  return Array.from(
    {length: Math.max(0, lastDayIndex - firstDayIndex + 1)},
    (_, index): AgpDailyProfile => {
      const dayStartMs = (firstDayIndex + index) * DAY_MS - offsetMs;
      const dayEndMs = dayStartMs + DAY_MS;
      const visibleStartMs = Math.max(dayStartMs, input.period.startMs);
      const visibleEndMs = Math.min(dayEndMs, input.period.endMs);
      const samples = validSamples
        .filter(
          sample =>
            sample.timestampMs >= visibleStartMs &&
            sample.timestampMs < visibleEndMs,
        )
        .sort((left, right) => left.timestampMs - right.timestampMs);
      const expectedSampleCount = Math.max(
        1,
        Math.ceil(
          (visibleEndMs - visibleStartMs) / input.expectedSampleIntervalMs,
        ),
      );
      const rawCoveragePercent =
        (samples.length / expectedSampleCount) * 100;
      const coveragePercent = roundTo(Math.min(100, rawCoveragePercent));
      const coverageQuality: TrendsCoverageQuality =
        samples.length === 0
          ? 'no-data'
          : rawCoveragePercent >= 70
          ? 'adequate'
          : 'low';
      const timestamps = [
        visibleStartMs,
        ...samples.map(sample => sample.timestampMs),
        visibleEndMs,
      ];
      const largestGapMs = timestamps
        .slice(1)
        .reduce(
          (largest, timestampMs, timestampIndex) =>
            Math.max(largest, timestampMs - timestamps[timestampIndex]!),
          0,
        );

      return {
        dayStartMs,
        dayEndMs,
        sampleCount: samples.length,
        expectedSampleCount,
        coveragePercent,
        coverageQuality,
        largestGapMs,
        points: samples.map(sample => ({
          timestampMs: sample.timestampMs,
          minuteOfDay: Math.floor(
            (((sample.timestampMs + offsetMs) % DAY_MS) + DAY_MS) % DAY_MS /
              MINUTE_MS,
          ),
          valueMgDl: sample.valueMgDl,
        })),
      };
    },
  );
};

const assertInput = (input: BuildAgpProfileInput): void => {
  if (
    !Number.isFinite(input.timeZoneOffsetMinutes) ||
    !Number.isInteger(input.timeZoneOffsetMinutes) ||
    Math.abs(input.timeZoneOffsetMinutes) > 14 * 60
  ) {
    throw new TrendsOverviewInputError(
      'The AGP time-zone offset must be a whole number of minutes between -840 and 840.',
    );
  }
};

export const buildAgpProfile = (input: BuildAgpProfileInput): AgpProfile => {
  assertInput(input);
  const prepared = prepareTrendsSampleSet(input);
  const validSamples = prepared.validSamples;
  const valuesByHour = Array.from({length: 24}, () => [] as number[]);
  const localDays = new Set<number>();
  validSamples.forEach(sample => {
    valuesByHour[
      localHour(sample.timestampMs, input.timeZoneOffsetMinutes)
    ]!.push(sample.valueMgDl);
    localDays.add(
      Math.floor(
        localTimestamp(sample.timestampMs, input.timeZoneOffsetMinutes) /
          DAY_MS,
      ),
    );
  });

  const buckets = valuesByHour.map((values, hour): AgpHourBucket => {
    const sortedValues = [...values].sort((left, right) => left - right);
    if (sortedValues.length === 0) {
      return {
        hour,
        sampleCount: 0,
        p10MgDl: undefined,
        p25MgDl: undefined,
        medianMgDl: undefined,
        p75MgDl: undefined,
        p90MgDl: undefined,
      };
    }
    return {
      hour,
      sampleCount: sortedValues.length,
      p10MgDl: percentile(sortedValues, 0.1),
      p25MgDl: percentile(sortedValues, 0.25),
      medianMgDl: percentile(sortedValues, 0.5),
      p75MgDl: percentile(sortedValues, 0.75),
      p90MgDl: percentile(sortedValues, 0.9),
    };
  });

  return {
    period: input.period,
    timeZoneOffsetMinutes: input.timeZoneOffsetMinutes,
    quality: {
      validSampleCount: validSamples.length,
      excludedSampleCount: prepared.excludedSampleCount,
      duplicateSampleCount: prepared.duplicateSampleCount,
      expectedSampleCount: prepared.expectedSampleCount,
      coveragePercent: prepared.coveragePercent,
      coverageQuality: prepared.coverageQuality,
      durationQuality: prepared.durationQuality,
      interpretationQuality: prepared.interpretationQuality,
      daysWithData: localDays.size,
      largestGapMs: prepared.largestGapMs,
      lastReadingTimestampMs: prepared.lastReadingTimestampMs,
    },
    buckets,
    dailyProfiles: dailyProfiles(input, validSamples),
  };
};
