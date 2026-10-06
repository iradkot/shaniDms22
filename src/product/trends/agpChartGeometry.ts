import type {AgpHourBucket, AgpProfile} from '../../modules/trends/domain/agp';

export interface AgpChartThresholds {
  readonly targetMinMgDl: number;
  readonly targetMaxMgDl: number;
}

export interface AgpChartPoint {
  readonly hour: number;
  readonly x: number;
  readonly p10Y: number;
  readonly p25Y: number;
  readonly medianY: number;
  readonly p75Y: number;
  readonly p90Y: number;
}

export interface AgpChartSegment {
  readonly points: readonly AgpChartPoint[];
  /** Single hours have markers instead of implying a continuous band. */
  readonly outerPath: string | undefined;
  readonly innerPath: string | undefined;
  readonly medianPath: string | undefined;
}

export interface AgpChartGeometry {
  readonly width: number;
  readonly height: number;
  readonly plot: {
    readonly left: number;
    readonly right: number;
    readonly top: number;
    readonly bottom: number;
    readonly width: number;
    readonly height: number;
  };
  readonly minMgDl: number;
  readonly maxMgDl: number;
  readonly yTicks: readonly number[];
  readonly segments: readonly AgpChartSegment[];
  readonly xAtHour: (hour: number) => number;
  readonly yAtMgDl: (value: number) => number;
}

const valuesOf = (bucket: AgpHourBucket): readonly (number | undefined)[] => [
  bucket.p10MgDl,
  bucket.p25MgDl,
  bucket.medianMgDl,
  bucket.p75MgDl,
  bucket.p90MgDl,
];

const tickStep = (range: number): number => {
  const roughStep = Math.max(1, range / 5);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceStep =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceStep * magnitude;
};

const coordinate = (value: number): string =>
  String(Math.round(value * 1000) / 1000);

const linePath = (
  points: readonly AgpChartPoint[],
  value: (point: AgpChartPoint) => number,
): string =>
  points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${coordinate(point.x)} ${coordinate(
          value(point),
        )}`,
    )
    .join(' ');

const bandPath = (
  points: readonly AgpChartPoint[],
  upper: (point: AgpChartPoint) => number,
  lower: (point: AgpChartPoint) => number,
): string =>
  `${linePath(points, upper)} ${[...points]
    .reverse()
    .map(point => `L${coordinate(point.x)} ${coordinate(lower(point))}`)
    .join(' ')} Z`;

/** Plot the domain's hourly aggregate without synthesising missing buckets. */
export const buildAgpChartGeometry = (
  profile: AgpProfile,
  thresholds: AgpChartThresholds,
  width: number,
  height = 288,
): AgpChartGeometry => {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 320;
  const safeHeight = Number.isFinite(height) ? Math.max(0, height) : 288;
  const left = Math.min(42, safeWidth * 0.2);
  const right = safeWidth - Math.min(16, safeWidth * 0.08);
  const top = Math.min(20, safeHeight * 0.1);
  const bottom = safeHeight - Math.min(36, safeHeight * 0.2);
  const plot = {
    left,
    right,
    top,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
  const actualValues = [
    ...profile.buckets.flatMap(valuesOf),
    ...profile.dailyProfiles.flatMap(day =>
      day.points.map(point => point.valueMgDl),
    ),
    thresholds.targetMinMgDl,
    thresholds.targetMaxMgDl,
  ].filter(
    (value): value is number => value !== undefined && Number.isFinite(value),
  );
  // Scan instead of spreading a potentially large period into Math.min/max.
  const smallest = actualValues.reduce(
    (low, value) => Math.min(low, value),
    40,
  );
  const largest = actualValues.reduce(
    (high, value) => Math.max(high, value),
    250,
  );
  const step = tickStep(largest - smallest);
  const lowerBound = smallest >= 0 ? Math.max(0, smallest - 10) : smallest - 10;
  const minMgDl = Math.floor(lowerBound / step) * step;
  const maxMgDl =
    Math.ceil((largest + Math.max(10, (largest - smallest) * 0.05)) / step) *
    step;
  const yTicks = Array.from(
    {length: Math.round((maxMgDl - minMgDl) / step) + 1},
    (_, index) => minMgDl + index * step,
  );
  const xAtHour = (hour: number): number => left + (hour / 24) * plot.width;
  const yAtMgDl = (value: number): number =>
    bottom - ((value - minMgDl) / (maxMgDl - minMgDl)) * plot.height;
  const byHour = new Map(profile.buckets.map(bucket => [bucket.hour, bucket]));
  const pointSegments: AgpChartPoint[][] = [];
  let current: AgpChartPoint[] | undefined;
  for (let hour = 0; hour < 24; hour++) {
    const bucket = byHour.get(hour);
    if (
      !bucket ||
      bucket.sampleCount === 0 ||
      !valuesOf(bucket).every(
        value => value !== undefined && Number.isFinite(value),
      )
    ) {
      current = undefined;
      continue;
    }
    if (!current) {
      current = [];
      pointSegments.push(current);
    }
    current.push({
      hour,
      // A bucket represents this whole clock hour, not an instant at midnight.
      x: xAtHour(hour + 0.5),
      p10Y: yAtMgDl(bucket.p10MgDl!),
      p25Y: yAtMgDl(bucket.p25MgDl!),
      medianY: yAtMgDl(bucket.medianMgDl!),
      p75Y: yAtMgDl(bucket.p75MgDl!),
      p90Y: yAtMgDl(bucket.p90MgDl!),
    });
  }
  return {
    width: safeWidth,
    height: safeHeight,
    plot,
    minMgDl,
    maxMgDl,
    yTicks,
    xAtHour,
    yAtMgDl,
    segments: pointSegments.map(points => ({
      points,
      outerPath:
        points.length > 1
          ? bandPath(
              points,
              point => point.p90Y,
              point => point.p10Y,
            )
          : undefined,
      innerPath:
        points.length > 1
          ? bandPath(
              points,
              point => point.p75Y,
              point => point.p25Y,
            )
          : undefined,
      medianPath:
        points.length > 1
          ? linePath(points, point => point.medianY)
          : undefined,
    })),
  };
};
