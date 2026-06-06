import type {BgSample} from 'app/types/day_bgs.types';

export type LoadPoint = {x: number; y: number};
export type SplitIobPoint = {
  x: number;
  bolus: number;
  basal: number;
  total: number;
};

export const MAX_LOAD_CURSOR_DISTANCE_MS = 10 * 60_000;

function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function buildChartLoadSeries(
  bgSamples: BgSample[],
  xDomain: [Date, Date],
): {
  iobPoints: LoadPoint[];
  splitIobPoints: SplitIobPoint[];
  cobPoints: LoadPoint[];
} {
  const startMs = xDomain[0].getTime();
  const endMs = xDomain[1].getTime();
  const iobPoints: LoadPoint[] = [];
  const splitIobPoints: SplitIobPoint[] = [];
  const cobPoints: LoadPoint[] = [];

  for (const sample of bgSamples ?? []) {
    const x = sample.date;
    if (!Number.isFinite(x) || x < startMs || x > endMs) continue;

    const explicitTotal = finiteNumber(sample.iob);
    const bolus = finiteNumber(sample.iobBolus);
    const basal = finiteNumber(sample.iobBasal);
    const splitTotal = bolus != null && basal != null ? bolus + basal : null;
    const total = explicitTotal ?? splitTotal;

    if (total != null) {
      iobPoints.push({x, y: total});
    }

    if (
      bolus != null &&
      basal != null &&
      (bolus + basal !== 0 || total == null || total === 0)
    ) {
      const sourceTotal = bolus + basal;
      const displayTotal = total ?? sourceTotal;
      const scale = sourceTotal !== 0 ? displayTotal / sourceTotal : 1;
      splitIobPoints.push({
        x,
        bolus: bolus * scale,
        basal: basal * scale,
        total: displayTotal,
      });
    }

    const cob = finiteNonNegative(sample.cob);
    if (cob != null) {
      cobPoints.push({x, y: cob});
    }
  }

  iobPoints.sort((a, b) => a.x - b.x);
  splitIobPoints.sort((a, b) => a.x - b.x);
  cobPoints.sort((a, b) => a.x - b.x);

  return {iobPoints, splitIobPoints, cobPoints};
}

export function findNearestLoadPoint(
  points: LoadPoint[],
  targetMs: number | null | undefined,
  maxDistanceMs = MAX_LOAD_CURSOR_DISTANCE_MS,
): LoadPoint | null {
  if (!points.length) return null;
  if (targetMs == null) return points[points.length - 1];

  let best = points[0];
  let bestDistance = Math.abs(best.x - targetMs);
  for (const point of points) {
    const distance = Math.abs(point.x - targetMs);
    if (distance < bestDistance) {
      best = point;
      bestDistance = distance;
    }
  }

  return bestDistance <= maxDistanceMs ? best : null;
}
