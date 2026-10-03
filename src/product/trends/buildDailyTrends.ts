import {
  buildTrendsOverview,
  prepareTrendsSampleSet,
  type BuildTrendsOverviewInput,
  type TrendsGlucoseSample,
  type TrendsOverview,
} from '../../modules/trends';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export interface TrendsDaySummary {
  readonly localDayStartMs: number;
  readonly partialDay: boolean;
  readonly overview: TrendsOverview;
}

/** Calendar buckets share the overview's filtering, thresholds, and timezone. */
export const buildDailyTrends = (
  input: BuildTrendsOverviewInput,
): readonly TrendsDaySummary[] => {
  const offsetMs = (input.timeZoneOffsetMinutes ?? 0) * MINUTE_MS;
  const firstDay = Math.floor((input.period.startMs + offsetMs) / DAY_MS);
  const lastDay = Math.floor((input.period.endMs - 1 + offsetMs) / DAY_MS);
  const buckets = new Map<number, TrendsGlucoseSample[]>();
  for (const sample of prepareTrendsSampleSet(input).validSamples) {
    const day = Math.floor((sample.timestampMs + offsetMs) / DAY_MS);
    const bucket = buckets.get(day) ?? [];
    bucket.push(sample);
    buckets.set(day, bucket);
  }
  const result: TrendsDaySummary[] = [];
  for (let day = firstDay; day <= lastDay; day += 1) {
    const localDayStartMs = day * DAY_MS - offsetMs;
    const startMs = Math.max(localDayStartMs, input.period.startMs);
    const endMs = Math.min(localDayStartMs + DAY_MS, input.period.endMs);
    result.push({
      localDayStartMs,
      partialDay: endMs - startMs < DAY_MS,
      overview: buildTrendsOverview({
        ...input,
        period: {startMs, endMs},
        samples: buckets.get(day) ?? [],
      }),
    });
  }
  return result;
};
