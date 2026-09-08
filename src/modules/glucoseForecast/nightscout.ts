import type {ForecastDeviceStatus, ForecastReading} from './types';

const object = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const number = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const time = (value: unknown): number | undefined => {
  const n = typeof value === 'string' ? Date.parse(value) : number(value);
  return n !== undefined && Number.isSafeInteger(n) && n > 0 ? n : undefined;
};

/** Only the published Loop combined prediction; no guessed start time or effect arrays. */
export function decodeForecastDeviceStatus(
  value: unknown,
): ForecastDeviceStatus | undefined {
  const row = object(value);
  if (!row) {
    return undefined;
  }
  const loop = object(row.loop);
  const predicted = object(loop?.predicted) ?? object(row.loopPrediction);
  const ts = time(row.ts) ?? time(row.created_at) ?? time(row.mills);
  if (ts === undefined) {
    return undefined;
  }
  const loopTimestampMs = time(loop?.timestamp) ?? time(row.loopTimestampMs);
  const startMs = time(predicted?.startDate) ?? time(predicted?.startMs);
  const values = predicted?.values;
  const loopPrediction =
    startMs !== undefined &&
    Array.isArray(values) &&
    values.length >= 2 &&
    values.length <= 289 &&
    values.every(
      v =>
        typeof v === 'number' && Number.isFinite(v) && v >= -1000 && v <= 1000,
    )
      ? {startMs, values: values as number[]}
      : undefined;
  const iob = object(loop?.iob);
  const cob = object(loop?.cob);
  const iobUnits = number(iob?.iob) ?? number(row.iobUnits);
  const cobGrams = number(cob?.cob) ?? number(row.cobGrams);
  const iobTimestampMs = time(iob?.timestamp) ?? time(row.iobTimestampMs);
  const cobTimestampMs = time(cob?.timestamp) ?? time(row.cobTimestampMs);
  return {
    ts,
    ...(loopTimestampMs === undefined ? {} : {loopTimestampMs}),
    ...(loopPrediction === undefined ? {} : {loopPrediction}),
    ...(iobUnits === undefined || Math.abs(iobUnits) > 100 ? {} : {iobUnits}),
    ...(iobTimestampMs === undefined ? {} : {iobTimestampMs}),
    ...(cobGrams === undefined || cobGrams < 0 || cobGrams > 1000
      ? {}
      : {cobGrams}),
    ...(cobTimestampMs === undefined ? {} : {cobTimestampMs}),
  };
}

/** Exact deterministic Nightscout AR2 mean; see docs/research/glucose-forecast-sources.md. */
export function nightscoutAr2(
  previous: ForecastReading,
  current: ForecastReading,
): ForecastReading[] {
  // AR2 expects one CGM interval, not arbitrary adjacent records or a gap.
  if (
    Math.abs(current.ts - previous.ts - 300_000) > 60_000 ||
    previous.sgv < 39 ||
    current.sgv < 39 ||
    previous.sgv > 400 ||
    current.sgv > 400
  ) {
    return [];
  }
  let prev = Math.log(previous.sgv / 140);
  let curr = Math.log(current.sgv / 140);
  const points: ForecastReading[] = [];
  for (let step = 1; step <= 6; step++) {
    const next = -0.723 * prev + 1.716 * curr;
    prev = curr;
    curr = next;
    points.push({
      ts: current.ts + step * 300_000,
      sgv: Math.max(36, Math.min(400, Math.round(140 * Math.exp(curr)))),
    });
  }
  return points;
}

/** Compact legacy/current snapshot uses the same absolute Loop clock as the graph. */
export function futureLoopPoints(
  value: unknown,
  nowMs: number,
): ForecastReading[] {
  const row = decodeForecastDeviceStatus(value);
  const p = row?.loopPrediction;
  if (
    !row ||
    !p ||
    row.loopTimestampMs === undefined ||
    [row.ts, row.loopTimestampMs, p.startMs].some(
      ts => ts > nowMs || nowMs - ts >= 15 * 60_000,
    )
  ) {
    return [];
  }
  return p.values
    .map((sgv, index) => ({
      ts: p.startMs + index * 300_000,
      sgv: Math.round(sgv),
    }))
    .filter(
      point =>
        point.ts > nowMs &&
        point.ts <= nowMs + 30 * 60_000 &&
        point.sgv >= 10 &&
        point.sgv <= 1000,
    );
}
