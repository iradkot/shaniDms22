import {decodeForecastDeviceStatus, nightscoutAr2} from './nightscout';
import type {
  ForecastContextEvent,
  ForecastDeviceStatus,
  ForecastPoint,
  ForecastReading,
  ForecastSourceId,
  GlucoseForecastInput,
  GlucoseForecastSeries,
  GlucoseForecastSnapshot,
} from './types';

const MIN = 60_000;
const DAY = 1440 * MIN;
const FRESH = 15 * MIN;
const HORIZON = 30 * MIN;
const MAX_GAP = 7.5 * MIN;
const clamp = (value: number) => Math.max(36, Math.min(400, value));
const mean = (values: readonly number[]) =>
  values.reduce((a, b) => a + b, 0) / values.length;
const quantile = (values: readonly number[], q: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return (
    sorted[
      Math.min(
        sorted.length - 1,
        Math.max(0, Math.ceil((sorted.length + 1) * q) - 1),
      )
    ] ?? 0
  );
};

function cleanGlucose(input: GlucoseForecastInput): ForecastReading[] {
  const byTime = new Map<number, ForecastReading>();
  const conflicted = new Set<number>();
  for (const point of input.glucose) {
    if (
      !Number.isSafeInteger(point.ts) ||
      point.ts <= 0 ||
      point.ts > input.nowMs ||
      point.ts < input.nowMs - 29 * DAY ||
      !Number.isFinite(point.sgv) ||
      point.sgv < 39 ||
      point.sgv > 400
    ) {
      continue;
    }
    if (byTime.has(point.ts) && byTime.get(point.ts)!.sgv !== point.sgv) {
      conflicted.add(point.ts);
    }
    byTime.set(point.ts, point);
  }
  return [...byTime.values()]
    .filter(p => !conflicted.has(p.ts))
    .sort((a, b) => a.ts - b.ts);
}

function atOrBefore<T>(
  rows: readonly T[],
  ts: number,
  getTime: (row: T) => number,
): number {
  let left = 0;
  let right = rows.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (getTime(rows[mid]!) <= ts) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }
  return left - 1;
}

/** Interpolate only adjacent, bounded points; never project across missing history. */
function valueAt(
  points: readonly ForecastReading[],
  ts: number,
): number | undefined {
  const index = atOrBefore(points, ts, p => p.ts);
  const left = points[index];
  const right = points[index + 1];
  if (left?.ts === ts) {
    return left.sgv;
  }
  if (!left || !right || right.ts - left.ts > MAX_GAP) {
    return undefined;
  }
  return (
    left.sgv + ((right.sgv - left.sgv) * (ts - left.ts)) / (right.ts - left.ts)
  );
}

interface Features {
  readonly sample: ForecastReading;
  readonly slope: number;
  readonly acceleration: number;
  readonly hour: number;
  readonly weekday: number;
  readonly iob?: number;
  readonly cob?: number;
  readonly meal?: number;
  readonly activity?: number;
}
interface Example {
  readonly features: Features;
  readonly outcomes: readonly number[];
}
type FeatureKey = 'iob' | 'cob' | 'meal' | 'activity';
interface PersonalResult {
  readonly points: readonly ForecastPoint[];
  readonly count: number;
  readonly mask: readonly FeatureKey[];
}
interface RawSeries {
  readonly id: ForecastSourceId;
  readonly sourceTimestampMs: number;
  readonly points: readonly ForecastPoint[];
  readonly key: string;
}
interface ErrorSample {
  readonly ts: number;
  readonly errors: readonly number[];
}

function freshLoads(rows: readonly ForecastDeviceStatus[], nowMs: number) {
  let iob: number | undefined;
  let cob: number | undefined;
  let iobTimestampMs: number | undefined;
  let cobTimestampMs: number | undefined;
  for (let index = atOrBefore(rows, nowMs, r => r.ts); index >= 0; index--) {
    const row = rows[index]!;
    if (nowMs - row.ts > FRESH) {
      break;
    }
    if (
      row.iobTimestampMs !== undefined &&
      row.iobTimestampMs > (iobTimestampMs ?? 0) &&
      row.iobTimestampMs <= nowMs &&
      nowMs - row.iobTimestampMs <= FRESH &&
      row.iobUnits !== undefined
    ) {
      iob = row.iobUnits;
      iobTimestampMs = row.iobTimestampMs;
    }
    if (
      row.cobTimestampMs !== undefined &&
      row.cobTimestampMs > (cobTimestampMs ?? 0) &&
      row.cobTimestampMs <= nowMs &&
      nowMs - row.cobTimestampMs <= FRESH &&
      row.cobGrams !== undefined
    ) {
      cob = row.cobGrams;
      cobTimestampMs = row.cobTimestampMs;
    }
  }
  return {
    ...(iob === undefined ? {} : {iob, iobTimestampMs: iobTimestampMs!}),
    ...(cob === undefined ? {} : {cob, cobTimestampMs: cobTimestampMs!}),
  };
}

function featuresAt(
  glucose: readonly ForecastReading[],
  index: number,
  rows: readonly ForecastDeviceStatus[],
  events: readonly ForecastContextEvent[],
): Features | undefined {
  const sample = glucose[index];
  if (!sample) {
    return undefined;
  }
  const before5 = valueAt(glucose, sample.ts - 5 * MIN);
  const before15 = valueAt(glucose, sample.ts - 15 * MIN);
  const before10 = valueAt(glucose, sample.ts - 10 * MIN);
  if (
    before5 === undefined ||
    before10 === undefined ||
    before15 === undefined
  ) {
    return undefined;
  }
  const recent = events.filter(
    e =>
      e.ts <= sample.ts &&
      sample.ts - e.ts <= 3 * 60 * MIN &&
      e.recordedAtMs !== undefined &&
      e.recordedAtMs <= sample.ts,
  );
  const meals = recent.filter(e => e.kind === 'meal');
  const activities = recent.filter(e => e.kind === 'activity');
  const date = new Date(sample.ts);
  const loads = freshLoads(rows, sample.ts);
  return {
    sample,
    slope: (sample.sgv - before15) / 15,
    acceleration: (sample.sgv - before5) / 5 - (before5 - before15) / 10,
    hour: date.getHours() + date.getMinutes() / 60,
    weekday: date.getDay(),
    ...(loads.iob === undefined ? {} : {iob: loads.iob}),
    ...(loads.cob === undefined ? {} : {cob: loads.cob}),
    ...(meals.length === 0
      ? {}
      : {meal: meals.reduce((n, e) => n + (e.carbsGrams ?? 0), 0)}),
    ...(activities.length === 0
      ? {}
      : {
          activity:
            (sample.ts - Math.max(...activities.map(activity => activity.ts))) /
            MIN,
        }),
  };
}

function personalPrediction(
  current: Features,
  examples: readonly Example[],
  firstMs: number,
): PersonalResult | undefined {
  if (current.sample.ts - firstMs < 7 * DAY) {
    return undefined;
  }
  const eligible = examples.filter(
    e =>
      e.features.sample.ts + HORIZON < current.sample.ts &&
      e.features.sample.ts >= current.sample.ts - 28 * DAY,
  );
  // Optional facts only become model features with enough earlier measured examples.
  const mask = (['iob', 'cob', 'meal', 'activity'] as const).filter(
    key =>
      current[key] !== undefined &&
      eligible.filter(e => e.features[key] !== undefined).length >= 40,
  );
  const distances = eligible
    .filter(e => mask.every(key => e.features[key] !== undefined))
    .map(example => {
      const f = example.features;
      const hourDiff = Math.abs(f.hour - current.hour);
      let distance =
        Math.pow((f.sample.sgv - current.sample.sgv) / 35, 2) +
        Math.pow((f.slope - current.slope) / 1.5, 2) +
        Math.pow((f.acceleration - current.acceleration) / 1.5, 2) +
        Math.pow(Math.min(hourDiff, 24 - hourDiff) / 4, 2) +
        (f.weekday === current.weekday ? 0 : 0.25);
      for (const key of mask) {
        const scale = key === 'iob' ? 2 : key === 'activity' ? 60 : 25;
        distance += Math.pow((f[key]! - current[key]!) / scale, 2);
      }
      return {example, distance};
    })
    .filter(e => e.distance <= 9)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 40);
  const days = new Set(
    distances.map(e => Math.floor(e.example.features.sample.ts / DAY)),
  );
  if (distances.length < 20 || days.size < 3) {
    return undefined;
  }
  const totalWeight = distances.reduce((n, e) => n + 1 / (1 + e.distance), 0);
  return {
    count: distances.length,
    mask,
    points: Array.from({length: 6}, (_, step) => ({
      ts: current.sample.ts + (step + 1) * 5 * MIN,
      sgv: Math.round(
        clamp(
          current.sample.sgv +
            distances.reduce(
              (n, e) =>
                n +
                (e.example.outcomes[step]! - e.example.features.sample.sgv) /
                  (1 + e.distance),
              0,
            ) /
              totalWeight,
        ),
      ),
    })),
  };
}

function loopPrediction(
  rows: readonly ForecastDeviceStatus[],
  nowMs: number,
  anchorMs: number,
): RawSeries | undefined {
  let newest: RawSeries | undefined;
  for (let index = atOrBefore(rows, nowMs, r => r.ts); index >= 0; index--) {
    const row = rows[index]!;
    if (nowMs - row.ts > FRESH) {
      break;
    }
    const p = row.loopPrediction;
    const source = row.loopTimestampMs;
    if (
      !p ||
      source === undefined ||
      source <= (newest?.sourceTimestampMs ?? 0) ||
      source > nowMs ||
      nowMs - source > FRESH ||
      p.startMs > nowMs ||
      nowMs - p.startMs > FRESH
    ) {
      continue;
    }
    const curve = p.values.map((sgv, step) => ({
      ts: p.startMs + step * 5 * MIN,
      sgv,
    }));
    const points = Array.from({length: 6}, (_, step) => {
      const ts = anchorMs + (step + 1) * 5 * MIN;
      const sgv = valueAt(curve, ts);
      return sgv === undefined || sgv < 10 || sgv > 1000
        ? undefined
        : {ts, sgv: Math.round(sgv)};
    });
    // A full target horizon is required for a comparable +30m summary/replay.
    if (points.some(pnt => pnt === undefined)) {
      continue;
    }
    newest = {
      id: 'loop',
      key: 'loop',
      sourceTimestampMs: source,
      points: points as ForecastPoint[],
    };
  }
  return newest;
}

function predictAt(
  glucose: readonly ForecastReading[],
  index: number,
  rows: readonly ForecastDeviceStatus[],
  events: readonly ForecastContextEvent[],
  examples: readonly Example[],
  nowMs: number,
) {
  const current = glucose[index]!;
  const sources: RawSeries[] = [];
  const previous = glucose[index - 1];
  const ns = previous ? nightscoutAr2(previous, current) : [];
  if (ns.length) {
    sources.push({
      id: 'nightscout',
      key: 'nightscout',
      sourceTimestampMs: current.ts,
      points: ns,
    });
  }
  const loop = loopPrediction(rows, nowMs, current.ts);
  if (loop) {
    sources.push(loop);
  }
  const features = featuresAt(glucose, index, rows, events);
  const personal = features
    ? personalPrediction(features, examples, glucose[0]!.ts)
    : undefined;
  if (personal) {
    sources.push({
      id: 'personalized',
      key: `personalized:${personal.mask.join(',')}`,
      sourceTimestampMs: current.ts,
      points: personal.points,
    });
  }
  if (sources.length >= 2) {
    // Fixed arithmetic blend, not tuned against the evaluation set. Loop already includes IOB/COB.
    const key = `ensemble:${sources.map(s => s.key).join('|')}`;
    sources.push({
      id: 'ensemble',
      key,
      sourceTimestampMs: Math.min(...sources.map(s => s.sourceTimestampMs)),
      points: Array.from({length: 6}, (_, i) => ({
        ts: current.ts + (i + 1) * 5 * MIN,
        sgv: Math.round(mean(sources.map(s => s.points[i]!.sgv))),
      })),
    });
  }
  return {sources, personal};
}

/** Read-only experimental forecasts; all evaluation origins precede their outcomes. */
export function buildGlucoseForecast(
  input: GlucoseForecastInput,
): GlucoseForecastSnapshot {
  const glucose = cleanGlucose(input);
  const latest = glucose[glucose.length - 1];
  const history = glucose.filter(p => p.ts >= input.nowMs - 6 * 60 * MIN);
  const historyDays =
    glucose.length > 1 ? Math.floor((latest!.ts - glucose[0]!.ts) / DAY) : 0;
  const base = {
    version: 1 as const,
    generatedAtMs: input.nowMs,
    glucoseTimestampMs: latest?.ts ?? 0,
    history,
  };
  if (!latest || input.nowMs - latest.ts >= FRESH || glucose.length < 2) {
    return {
      ...base,
      series: [],
      context: {historyDays, matchedExamples: 0, features: []},
      unavailableReason:
        latest && input.nowMs - latest.ts >= FRESH
          ? 'stale-glucose'
          : 'insufficient-glucose',
    };
  }
  const rows = (input.deviceStatus ?? [])
    .flatMap(row => {
      const decoded = decodeForecastDeviceStatus(row);
      return decoded && decoded.ts <= input.nowMs ? [decoded] : [];
    })
    .sort((a, b) => a.ts - b.ts);
  const events = input.events ?? [];
  const examples: Example[] = [];
  let previousAnchor = 0;
  for (let index = 0; index < glucose.length; index++) {
    const sample = glucose[index]!;
    if (
      sample.ts - previousAnchor < HORIZON ||
      sample.ts + HORIZON >= latest.ts
    ) {
      continue;
    }
    const features = featuresAt(glucose, index, rows, events);
    if (!features) {
      continue;
    }
    const outcomes = Array.from({length: 6}, (_, i) =>
      valueAt(glucose, sample.ts + (i + 1) * 5 * MIN),
    );
    if (outcomes.some(v => v === undefined)) {
      continue;
    }
    examples.push({features, outcomes: outcomes as number[]});
    previousAnchor = sample.ts;
  }
  const current = predictAt(
    glucose,
    glucose.length - 1,
    rows,
    events,
    examples,
    input.nowMs,
  );
  const errors = new Map<string, ErrorSample[]>();
  let previousEvaluation = 0;
  // Rolling-origin replay. Targets never cross the calibration/evaluation boundary.
  const split = latest.ts - 3 * DAY;
  for (let index = 0; index < glucose.length; index++) {
    const sample = glucose[index]!;
    if (
      sample.ts < latest.ts - 7 * DAY ||
      sample.ts - previousEvaluation < 60 * MIN ||
      sample.ts + HORIZON >= latest.ts ||
      (sample.ts < split && sample.ts + HORIZON >= split)
    ) {
      continue;
    }
    const outcomes = Array.from({length: 6}, (_, step) =>
      valueAt(glucose, sample.ts + (step + 1) * 5 * MIN),
    );
    if (outcomes.some(v => v === undefined)) {
      continue;
    }
    previousEvaluation = sample.ts;
    const replay = predictAt(glucose, index, rows, events, examples, sample.ts);
    for (const source of replay.sources) {
      const list = errors.get(source.key) ?? [];
      list.push({
        ts: sample.ts,
        errors: source.points.map((p, i) => outcomes[i]! - p.sgv),
      });
      errors.set(source.key, list);
    }
  }
  const labels: Record<ForecastSourceId, string> = {
    nightscout: 'Nightscout AR2',
    loop: 'Loop',
    personalized: 'Personal',
    ensemble: 'Combined',
  };
  const series: GlucoseForecastSeries[] = current.sources.map(source => {
    const records = errors.get(source.key) ?? [];
    const calibration = records.filter(e => e.ts < split);
    const evaluation = records.filter(e => e.ts >= split);
    const enough =
      calibration.length >= 40 &&
      evaluation.length >= 30 &&
      new Set(evaluation.map(e => Math.floor(e.ts / DAY))).size >= 2;
    const bounds = enough
      ? Array.from({length: 6}, (_, i) => ({
          low: Math.min(
            0,
            quantile(
              calibration.map(e => e.errors[i]!),
              0.05,
            ),
          ),
          high: Math.max(
            0,
            quantile(
              calibration.map(e => e.errors[i]!),
              0.95,
            ),
          ),
        }))
      : undefined;
    const lastBound = bounds?.[5];
    return {
      id: source.id,
      label: labels[source.id],
      sourceTimestampMs: source.sourceTimestampMs,
      points: source.points.map((point, i) => {
        const bound = bounds?.[i];
        // Bounds may extend outside the sensor range. Do not clip uncertainty.
        return {
          ...point,
          ...(bound
            ? {
                lower: Math.max(0, Math.round(point.sgv + bound.low)),
                upper: Math.round(point.sgv + bound.high),
              }
            : {}),
        };
      }),
      calibration:
        enough && lastBound
          ? {
              status: 'calibrated',
              sampleCount: evaluation.length,
              within20Percent: Math.round(
                (100 *
                  evaluation.filter(e => Math.abs(e.errors[5]!) <= 20).length) /
                  evaluation.length,
              ),
              coveragePercent: Math.round(
                (100 *
                  evaluation.filter(
                    e =>
                      e.errors[5]! >= lastBound.low &&
                      e.errors[5]! <= lastBound.high,
                  ).length) /
                  evaluation.length,
              ),
              meanAbsoluteErrorMgDl: Math.round(
                mean(evaluation.map(e => Math.abs(e.errors[5]!))),
              ),
            }
          : {status: 'uncalibrated', sampleCount: evaluation.length},
    };
  });
  const loads = freshLoads(rows, input.nowMs);
  return {
    ...base,
    series,
    load: loads,
    context: {
      historyDays,
      matchedExamples: current.personal?.count ?? 0,
      ...(loads.iob === undefined ? {} : {iobUnits: loads.iob}),
      ...(loads.cob === undefined ? {} : {cobGrams: loads.cob}),
      features: current.personal
        ? [
            'glucose',
            'trend',
            'time-of-day',
            'day-of-week',
            ...current.personal.mask,
          ]
        : ['glucose', 'trend'],
    },
  };
}
