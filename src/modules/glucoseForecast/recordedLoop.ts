import {getReleaseSafetyPolicy} from '../releaseSafety/policy';
import {createGlucoseForecastLoader} from './loader';
import {decodeForecastDeviceStatus, futureLoopPoints} from './nightscout';
import type {ForecastReading, GlucoseForecastSnapshot} from './types';

const MINUTE = 60_000;
const MAX_AGE = 15 * MINUTE;
type Dependencies = Parameters<typeof createGlucoseForecastLoader>[0];

/** Restricted releases display only the prediction already published by Loop. */
export function forecastForDisplay(
  snapshot: GlucoseForecastSnapshot | undefined,
): GlucoseForecastSnapshot | undefined {
  if (!snapshot || getReleaseSafetyPolicy().experimentalGlucoseForecasts) {
    return snapshot;
  }
  return {
    ...snapshot,
    series: snapshot.series.filter(series => series.id === 'loop').map(series => ({
      ...series,
      points: series.points.filter(point => Number.isFinite(point.ts) && Number.isFinite(point.sgv) &&
        point.ts > snapshot.generatedAtMs && point.ts <= snapshot.generatedAtMs + 30 * MINUTE &&
        point.sgv >= 10 && point.sgv <= 1000).map(({ts, sgv}) => ({ts, sgv})),
      calibration: {status: 'uncalibrated' as const, sampleCount: 0},
    })).filter(series => series.points.length > 0),
  };
}

/** Two recent reads, without personal models, replay, or historical warming. */
export function createRecordedLoopForecastLoader(dependencies: Dependencies) {
  const now = dependencies.now ?? Date.now;
  let generation = 0;
  let scope: string | undefined;
  let pending: Promise<GlucoseForecastSnapshot> | undefined;
  return (_options?: {readonly forceRefresh?: boolean}): Promise<GlucoseForecastSnapshot> => {
    const requestedScope = dependencies.getScopeKey();
    if (requestedScope !== scope) {
      scope = requestedScope;
      generation += 1;
      pending = undefined;
    }
    if (pending) {return pending;}
    const requestedGeneration = generation;
    const at = now();
    const work = Promise.all([
      dependencies.readGlucose(at - 30 * MINUTE, at + 1),
      dependencies.readDeviceStatus(at - MAX_AGE + 1, at + 1),
    ]).then(([glucose, statuses]): GlucoseForecastSnapshot => {
      if (requestedGeneration !== generation || dependencies.getScopeKey() !== requestedScope) {
        throw new Error('Forecast source changed during loading.');
      }
      const completedAt = now();
      const byTime = new Map<number, ForecastReading>();
      const conflicts = new Set<number>();
      glucose.forEach(point => {
        if (!Number.isSafeInteger(point.ts) || point.ts <= 0 || point.ts > completedAt ||
          completedAt - point.ts >= 30 * MINUTE || !Number.isFinite(point.sgv) ||
          point.sgv < 39 || point.sgv > 400) {return;}
        if (byTime.has(point.ts) && byTime.get(point.ts)!.sgv !== point.sgv) {
          conflicts.add(point.ts);
        }
        byTime.set(point.ts, point);
      });
      const history = [...byTime.values()].filter(point => !conflicts.has(point.ts))
        .sort((left, right) => left.ts - right.ts);
      const latest = history[history.length - 1];
      const base: GlucoseForecastSnapshot = {
        version: 1, generatedAtMs: completedAt, glucoseTimestampMs: latest?.ts ?? 0,
        history, series: [], context: {historyDays: 0, matchedExamples: 0, features: []},
      };
      if (!latest || completedAt - latest.ts >= MAX_AGE) {
        return {...base, unavailableReason: latest ? 'stale-glucose' : 'insufficient-glucose'};
      }
      const rows = statuses.flatMap(value => {
        const row = decodeForecastDeviceStatus(value);
        return row ? [row] : [];
      }).sort((left, right) =>
        (right.loopTimestampMs ?? 0) - (left.loopTimestampMs ?? 0) || right.ts - left.ts);
      const row = rows.find(value => futureLoopPoints(value, completedAt).length > 0);
      if (!row) {return base;}
      const fresh = (timestamp: number | undefined) => timestamp !== undefined &&
        timestamp <= completedAt && completedAt - timestamp < MAX_AGE;
      const iob = fresh(row.iobTimestampMs) ? row.iobUnits : undefined;
      const cob = fresh(row.cobTimestampMs) ? row.cobGrams : undefined;
      return {
        ...base,
        series: [{
          id: 'loop', label: 'Loop', sourceTimestampMs: row.loopTimestampMs!,
          points: futureLoopPoints(row, completedAt),
          calibration: {status: 'uncalibrated', sampleCount: 0},
        }],
        context: {
          ...base.context,
          ...(iob === undefined ? {} : {iobUnits: iob}),
          ...(cob === undefined ? {} : {cobGrams: cob}),
        },
      };
    });
    pending = work;
    work.finally(() => {
      if (pending === work) {pending = undefined;}
    }).catch(() => {});
    return work;
  };
}

export function createDayGraphForecastLoader(dependencies: Dependencies) {
  const recorded = createRecordedLoopForecastLoader(dependencies);
  const experimental = createGlucoseForecastLoader(dependencies);
  return (options?: {readonly forceRefresh?: boolean}) =>
    getReleaseSafetyPolicy().experimentalGlucoseForecasts
      ? experimental(options) : recorded(options);
}
