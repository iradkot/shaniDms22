import type {InsulinDataEntry} from 'app/types/insulin.types';

type InsulinPeriod = {readonly startMs: number; readonly endMs: number};

/** Distribution of normalized, finalized doses in an exclusive-end period.
 * Interval delivery is allocated uniformly. Repeated local hours share a bucket.
 * Rounded buckets add up to the rounded total; this does not infer missing doses.
 */
export function buildBolusRangeDistribution(
  entries: readonly InsulinDataEntry[],
  period: InsulinPeriod,
) {
  const hourlyUnits = new Map<number, number>();
  let count = 0;
  let totalUnits = 0;
  const add = (hour: number, units: number) => {
    hourlyUnits.set(hour, (hourlyUnits.get(hour) ?? 0) + units);
    totalUnits += units;
  };

  for (const entry of entries) {
    if (
      entry.type !== 'bolus' ||
      !Number.isFinite(entry.amount) ||
      (entry.amount ?? 0) <= 0
    ) {
      continue;
    }
    const units = entry.amount!;
    const startMs = Date.parse(entry.startTime ?? entry.timestamp ?? '');
    const endMs = entry.endTime
      ? Date.parse(entry.endTime)
      : startMs + (entry.duration ?? 0) * 60_000;
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      startMs >= period.endMs
    ) {
      continue;
    }
    if (endMs <= startMs) {
      if (startMs >= period.startMs) {
        count++;
        add(new Date(startMs).getHours(), units);
      }
      continue;
    }
    let cursor = Math.max(period.startMs, startMs);
    const overlapEnd = Math.min(period.endMs, endMs);
    if (cursor >= overlapEnd) {
      continue;
    }
    count++;
    while (cursor < overlapEnd) {
      const local = new Date(cursor);
      const untilNextHour =
        (60 - local.getMinutes()) * 60_000 -
        local.getSeconds() * 1000 -
        local.getMilliseconds();
      const segmentEnd = Math.min(overlapEnd, cursor + untilNextHour);
      add(
        local.getHours(),
        (units * (segmentEnd - cursor)) / (endMs - startMs),
      );
      cursor = segmentEnd;
    }
  }

  const buckets = [...hourlyUnits]
    .map(([hour, units]) => ({
      hour,
      hundredths: Math.floor(units * 100),
      remainder: units * 100 - Math.floor(units * 100),
    }))
    .sort((a, b) => b.remainder - a.remainder || a.hour - b.hour);
  const remaining =
    Math.round(totalUnits * 100) -
    buckets.reduce((sum, bucket) => sum + bucket.hundredths, 0);
  for (let index = 0; index < remaining && index < buckets.length; index++) {
    buckets[index]!.hundredths++;
  }
  const peak = [...hourlyUnits].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  return {
    count,
    totalUnits: Math.round(totalUnits * 100) / 100,
    peakLocalHour: peak?.[0] ?? null,
    byLocalHour: buckets
      .map(bucket => ({hour: bucket.hour, totalU: bucket.hundredths / 100}))
      .sort((a, b) => a.hour - b.hour),
  };
}
