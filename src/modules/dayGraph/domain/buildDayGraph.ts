import type {
  DayGraphActiveLoadSample,
  DayGraphBasalScheduleEntry,
  DayGraphGlucoseSample,
  DayGraphInsulinEvent,
  DayGraphPeriod,
  DayGraphTimelineItem,
} from '../contracts';

const MAX_LOAD_MATCH_DISTANCE_MS = 10 * 60 * 1000;

export interface DayGraphDataGap {
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

export interface DayGraphGlucoseSummary {
  readonly sampleCount: number;
  readonly minimumMgDl: number;
  readonly maximumMgDl: number;
  readonly first: {readonly timestampMs: number; readonly valueMgDl: number};
  readonly last: {readonly timestampMs: number; readonly valueMgDl: number};
}

export interface DayGraphQuality {
  readonly excludedGlucoseSampleCount: number;
  readonly duplicateGlucoseSampleCount: number;
  readonly excludedTimelineItemCount: number;
  readonly duplicateTimelineItemCount: number;
}

export interface DayGraphModel {
  readonly period: DayGraphPeriod;
  readonly glucoseSamples: readonly DayGraphGlucoseSample[];
  /** Each segment can be drawn without visually bridging a known data gap. */
  readonly glucoseSegments: readonly (readonly DayGraphGlucoseSample[])[];
  readonly timelineItems: readonly DayGraphTimelineItem[];
  readonly dataGaps: readonly DayGraphDataGap[];
  readonly glucoseSummary: DayGraphGlucoseSummary | undefined;
  readonly insulinEvents: readonly DayGraphInsulinEvent[];
  readonly basalSchedule: readonly DayGraphBasalScheduleEntry[];
  readonly quality: DayGraphQuality;
}

export interface BuildDayGraphInput {
  readonly period: DayGraphPeriod;
  readonly expectedSampleIntervalMs: number;
  readonly glucoseSamples: readonly DayGraphGlucoseSample[];
  readonly timelineItems: readonly DayGraphTimelineItem[];
  readonly activeLoadSamples?: readonly DayGraphActiveLoadSample[];
  readonly insulinEvents?: readonly DayGraphInsulinEvent[];
  readonly basalSchedule?: readonly DayGraphBasalScheduleEntry[];
}

const isNonEmptyString = (value: string): boolean => value.trim().length > 0;

const isValidIdentity = (value: DayGraphGlucoseSample['identity']): boolean =>
  isNonEmptyString(value.sourceId) && isNonEmptyString(value.recordId);

const identityKey = (value: DayGraphGlucoseSample['identity']): string =>
  `${value.sourceId.length}:${value.sourceId}${value.recordId.length}:${value.recordId}`;

const inside = (timestampMs: number, period: DayGraphPeriod): boolean =>
  Number.isFinite(timestampMs) &&
  timestampMs >= period.dayStartMs &&
  timestampMs < period.dayEndMs;

const validGlucoseSample = (
  sample: DayGraphGlucoseSample,
  period: DayGraphPeriod,
): boolean =>
  isValidIdentity(sample.identity) &&
  inside(sample.timestampMs, period) &&
  Number.isFinite(sample.valueMgDl) &&
  sample.valueMgDl > 0;

const validTimelineItem = (
  item: DayGraphTimelineItem,
  period: DayGraphPeriod,
): boolean =>
  isValidIdentity(item.identity) &&
  inside(item.timestampMs, period) &&
  isNonEmptyString(item.sourceLabel) &&
  isNonEmptyString(item.title);

const compareByTimeAndIdentity = <
  T extends {
    readonly timestampMs: number;
    readonly identity: DayGraphGlucoseSample['identity'];
  },
>(
  left: T,
  right: T,
): number =>
  left.timestampMs - right.timestampMs ||
  left.identity.sourceId.localeCompare(right.identity.sourceId) ||
  left.identity.recordId.localeCompare(right.identity.recordId);

const deduplicate = <
  T extends {readonly identity: DayGraphGlucoseSample['identity']},
>(
  values: readonly T[],
): {readonly values: readonly T[]; readonly duplicateCount: number} => {
  const seen = new Set<string>();
  const unique: T[] = [];
  let duplicateCount = 0;
  values.forEach(value => {
    const key = identityKey(value.identity);
    if (seen.has(key)) {
      duplicateCount += 1;
      return;
    }
    seen.add(key);
    unique.push(value);
  });
  return {values: unique, duplicateCount};
};

const summarize = (
  samples: readonly DayGraphGlucoseSample[],
): DayGraphGlucoseSummary | undefined => {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (!first || !last) {
    return undefined;
  }
  let minimumMgDl = first.valueMgDl;
  let maximumMgDl = first.valueMgDl;
  samples.forEach(sample => {
    minimumMgDl = Math.min(minimumMgDl, sample.valueMgDl);
    maximumMgDl = Math.max(maximumMgDl, sample.valueMgDl);
  });
  return {
    sampleCount: samples.length,
    minimumMgDl,
    maximumMgDl,
    first: {timestampMs: first.timestampMs, valueMgDl: first.valueMgDl},
    last: {timestampMs: last.timestampMs, valueMgDl: last.valueMgDl},
  };
};

const segmentGlucose = (
  samples: readonly DayGraphGlucoseSample[],
  gapThresholdMs: number,
): {
  readonly segments: readonly (readonly DayGraphGlucoseSample[])[];
  readonly gaps: readonly DayGraphDataGap[];
} => {
  if (samples.length === 0) {
    return {segments: [], gaps: []};
  }
  const segments: DayGraphGlucoseSample[][] = [[]];
  const gaps: DayGraphDataGap[] = [];
  samples.forEach((sample, index) => {
    const previous = samples[index - 1];
    if (
      previous &&
      sample.timestampMs - previous.timestampMs > gapThresholdMs
    ) {
      gaps.push({
        startMs: previous.timestampMs,
        endMs: sample.timestampMs,
        durationMs: sample.timestampMs - previous.timestampMs,
      });
      segments.push([]);
    }
    segments[segments.length - 1]!.push(sample);
  });
  return {segments, gaps};
};

const finite = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const normalizeLoadSample = (
  sample: DayGraphActiveLoadSample,
): DayGraphActiveLoadSample | undefined => {
  if (!Number.isFinite(sample.timestampMs)) {
    return undefined;
  }
  const iobUnits = finite(sample.iobUnits) ? sample.iobUnits : undefined;
  const bolusIobUnits = finite(sample.bolusIobUnits)
    ? sample.bolusIobUnits
    : undefined;
  const basalIobUnits = finite(sample.basalIobUnits)
    ? sample.basalIobUnits
    : undefined;
  const cobGrams =
    finite(sample.cobGrams) && sample.cobGrams >= 0
      ? sample.cobGrams
      : undefined;
  if (
    iobUnits === undefined &&
    bolusIobUnits === undefined &&
    basalIobUnits === undefined &&
    cobGrams === undefined
  ) {
    return undefined;
  }
  return {
    timestampMs: sample.timestampMs,
    ...(iobUnits === undefined ? {} : {iobUnits}),
    ...(bolusIobUnits === undefined ? {} : {bolusIobUnits}),
    ...(basalIobUnits === undefined ? {} : {basalIobUnits}),
    ...(cobGrams === undefined ? {} : {cobGrams}),
  };
};

const attachActiveLoad = (
  glucoseSamples: readonly DayGraphGlucoseSample[],
  activeLoadSamples: readonly DayGraphActiveLoadSample[],
): readonly DayGraphGlucoseSample[] => {
  const loads = activeLoadSamples
    .map(normalizeLoadSample)
    .filter(
      (sample): sample is DayGraphActiveLoadSample => sample !== undefined,
    )
    .sort((left, right) => left.timestampMs - right.timestampMs);
  if (loads.length === 0) {
    return glucoseSamples;
  }
  let loadIndex = 0;
  return glucoseSamples.map(sample => {
    while (
      loadIndex + 1 < loads.length &&
      loads[loadIndex + 1]!.timestampMs <= sample.timestampMs
    ) {
      loadIndex += 1;
    }
    const previous = loads[loadIndex];
    const next = loads[loadIndex + 1];
    const previousDistance = previous
      ? Math.abs(sample.timestampMs - previous.timestampMs)
      : Number.POSITIVE_INFINITY;
    const nextDistance = next
      ? Math.abs(sample.timestampMs - next.timestampMs)
      : Number.POSITIVE_INFINITY;
    const closest = previousDistance <= nextDistance ? previous : next;
    if (
      closest === undefined ||
      Math.min(previousDistance, nextDistance) > MAX_LOAD_MATCH_DISTANCE_MS
    ) {
      return sample;
    }
    return {
      ...sample,
      ...(closest.iobUnits === undefined ? {} : {iobUnits: closest.iobUnits}),
      ...(closest.bolusIobUnits === undefined
        ? {}
        : {bolusIobUnits: closest.bolusIobUnits}),
      ...(closest.basalIobUnits === undefined
        ? {}
        : {basalIobUnits: closest.basalIobUnits}),
      ...(closest.cobGrams === undefined ? {} : {cobGrams: closest.cobGrams}),
    };
  });
};

const insulinEventTime = (event: DayGraphInsulinEvent): number =>
  event.kind === 'bolus' ? event.timestampMs : event.startMs;

const validInsulinEvent = (
  event: DayGraphInsulinEvent,
  period: DayGraphPeriod,
): boolean => {
  if (event.kind === 'bolus') {
    return (
      inside(event.timestampMs, period) &&
      event.units > 0 &&
      finite(event.units)
    );
  }
  if (!finite(event.startMs)) {
    return false;
  }
  if (event.kind === 'temp-basal') {
    return (
      finite(event.endMs) &&
      event.endMs > event.startMs &&
      event.startMs < period.dayEndMs &&
      event.endMs > period.dayStartMs &&
      finite(event.rateUnitsPerHour) &&
      event.rateUnitsPerHour >= 0
    );
  }
  return (
    event.startMs < period.dayEndMs &&
    (event.endMs === undefined ||
      (finite(event.endMs) &&
        event.endMs > event.startMs &&
        event.endMs > period.dayStartMs))
  );
};

const validBasalScheduleEntry = (entry: DayGraphBasalScheduleEntry): boolean =>
  finite(entry.secondsFromMidnight) &&
  entry.secondsFromMidnight >= 0 &&
  entry.secondsFromMidnight < 24 * 60 * 60 &&
  finite(entry.rateUnitsPerHour) &&
  entry.rateUnitsPerHour >= 0;

/**
 * Builds the factual selected-day view. Identity deduplication is exact: time
 * proximity, equal carbohydrate values, or similar labels never merge items.
 */
export const buildDayGraph = (input: BuildDayGraphInput): DayGraphModel => {
  if (
    !Number.isFinite(input.period.dayStartMs) ||
    !Number.isFinite(input.period.dayEndMs) ||
    input.period.dayEndMs <= input.period.dayStartMs
  ) {
    throw new Error('Day Graph requires increasing finite day boundaries.');
  }
  if (
    !Number.isFinite(input.expectedSampleIntervalMs) ||
    input.expectedSampleIntervalMs <= 0
  ) {
    throw new Error('Expected sample interval must be positive.');
  }

  const validGlucose = input.glucoseSamples.filter(sample =>
    validGlucoseSample(sample, input.period),
  );
  const glucose = deduplicate(validGlucose);
  const sortedGlucose = attachActiveLoad(
    [...glucose.values].sort(compareByTimeAndIdentity),
    input.activeLoadSamples ?? [],
  );
  const validTimeline = input.timelineItems.filter(item =>
    validTimelineItem(item, input.period),
  );
  const timeline = deduplicate(validTimeline);
  const sortedTimeline = [...timeline.values].sort(compareByTimeAndIdentity);
  const segmented = segmentGlucose(
    sortedGlucose,
    input.expectedSampleIntervalMs * 3,
  );
  const insulinEvents = (input.insulinEvents ?? [])
    .filter(event => validInsulinEvent(event, input.period))
    .sort((left, right) => insulinEventTime(left) - insulinEventTime(right));
  const basalSchedule = (input.basalSchedule ?? [])
    .filter(validBasalScheduleEntry)
    .sort(
      (left, right) => left.secondsFromMidnight - right.secondsFromMidnight,
    );

  return {
    period: input.period,
    glucoseSamples: sortedGlucose,
    glucoseSegments: segmented.segments,
    timelineItems: sortedTimeline,
    dataGaps: segmented.gaps,
    glucoseSummary: summarize(sortedGlucose),
    insulinEvents,
    basalSchedule,
    quality: {
      excludedGlucoseSampleCount:
        input.glucoseSamples.length - validGlucose.length,
      duplicateGlucoseSampleCount: glucose.duplicateCount,
      excludedTimelineItemCount:
        input.timelineItems.length - validTimeline.length,
      duplicateTimelineItemCount: timeline.duplicateCount,
    },
  };
};
