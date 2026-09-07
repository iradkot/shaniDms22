import {
  buildTrendsOverview,
  prepareTrendsSampleSet,
  MINIMUM_ADEQUATE_COVERAGE_PERCENT,
  type TrendsRangeThresholds,
} from '../../trends';
import type {
  DayGraphCalendarDay,
  DayGraphCalendarSnapshot,
  DayGraphPeriod,
} from '../contracts';

export const DEFAULT_DAY_GRAPH_RANGE_THRESHOLDS: TrendsRangeThresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};

export const startOfLocalDay = (timestampMs: number): number => {
  const date = new Date(timestampMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
};

export const moveLocalDays = (timestampMs: number, days: number): number => {
  const date = new Date(startOfLocalDay(timestampMs));
  date.setDate(date.getDate() + days);
  return date.getTime();
};

export const startOfLocalMonth = (timestampMs: number): number => {
  const date = new Date(startOfLocalDay(timestampMs));
  date.setDate(1);
  return date.getTime();
};

export const periodForLocalMonth = (timestampMs: number): DayGraphPeriod => {
  const dayStartMs = startOfLocalMonth(timestampMs);
  const next = new Date(dayStartMs);
  next.setMonth(next.getMonth() + 1);
  return {dayStartMs, dayEndMs: next.getTime()};
};

/** Same validation, timestamp deduplication and target buckets as Trends. */
export const buildDayGraphCalendar = ({
  monthStartMs,
  nowMs,
  snapshot,
  thresholds = DEFAULT_DAY_GRAPH_RANGE_THRESHOLDS,
  expectedSampleIntervalMs = 5 * 60_000,
}: {
  readonly monthStartMs: number;
  readonly nowMs: number;
  readonly snapshot?: DayGraphCalendarSnapshot | undefined;
  readonly thresholds?: TrendsRangeThresholds;
  readonly expectedSampleIntervalMs?: number;
}): readonly DayGraphCalendarDay[] => {
  const period = periodForLocalMonth(monthStartMs);
  if (!Number.isFinite(period.dayStartMs) || !Number.isFinite(nowMs)) {
    throw new Error('Calendar dates must be finite.');
  }
  const samplesByDay = new Map<
    number,
    DayGraphCalendarSnapshot['glucoseSamples'][number][]
  >();
  for (const sample of snapshot?.glucoseSamples ?? []) {
    if (Number.isFinite(sample.timestampMs)) {
      const day = startOfLocalDay(sample.timestampMs);
      const samples = samplesByDay.get(day) ?? [];
      samples.push(sample);
      samplesByDay.set(day, samples);
    }
  }
  const days: DayGraphCalendarDay[] = [];
  for (
    let day = period.dayStartMs;
    day < period.dayEndMs;
    day = moveLocalDays(day, 1)
  ) {
    const dayEndMs = moveLocalDays(day, 1);
    // Never count future readings or penalize today for hours not elapsed yet.
    const endMs = Math.min(dayEndMs, nowMs + 1);
    const prepared =
      endMs > day
        ? prepareTrendsSampleSet({
            period: {startMs: day, endMs},
            expectedSampleIntervalMs,
            samples: samplesByDay.get(day) ?? [],
          })
        : undefined;
    const overview =
      endMs > day
        ? buildTrendsOverview({
            period: {startMs: day, endMs},
            thresholds,
            expectedSampleIntervalMs,
            samples: prepared?.validSamples ?? [],
          })
        : undefined;
    const hasData = (overview?.validSampleCount ?? 0) > 0;
    // Dense uploads cannot fill unrelated gaps. Count each observed interval once,
    // cap its duration at one expected sample, and never infer glucose across gaps.
    const observedMs =
      prepared?.validSamples.reduce(
        (total, sample, index, samples) =>
          total +
          Math.max(
            0,
            Math.min(
              endMs,
              sample.timestampMs + expectedSampleIntervalMs,
              samples[index + 1]?.timestampMs ?? endMs,
            ) - sample.timestampMs,
          ),
        0,
      ) ?? 0;
    const coveragePct =
      endMs > day ? Math.round((observedMs / (endMs - day)) * 10000) / 100 : 0;
    const verified =
      snapshot?.complete === true && snapshot.freshness.kind === 'fresh';
    days.push({
      dayStartMs: day,
      status: hasData ? 'data' : verified && day <= nowMs ? 'empty' : 'unknown',
      timeInRangePct: overview?.ranges?.targetPercent ?? null,
      coveragePct,
      partial:
        hasData &&
        (!verified ||
          dayEndMs > nowMs ||
          coveragePct < MINIMUM_ADEQUATE_COVERAGE_PERCENT),
    });
  }
  return days;
};
