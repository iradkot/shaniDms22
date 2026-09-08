import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import type {DayGraphDataSource} from '../../modules/dayGraph';
import type {GlucoseForecastSnapshot} from '../../modules/glucoseForecast';

const MINUTE_MS = 60_000;
const MAX_AGE_MS = 15 * MINUTE_MS;

interface ForecastState {
  readonly source: DayGraphDataSource;
  readonly snapshot?: GlucoseForecastSnapshot;
  readonly loading: boolean;
  readonly failed: boolean;
}

/** Hides stale predictions and never retains another patient's forecast. */
export const visibleGlucoseForecast = (
  snapshot: GlucoseForecastSnapshot | undefined,
  nowMs: number,
): GlucoseForecastSnapshot | undefined => {
  if (!snapshot || !Number.isFinite(snapshot.glucoseTimestampMs) ||
    !Number.isFinite(snapshot.generatedAtMs) ||
    nowMs - snapshot.glucoseTimestampMs >= MAX_AGE_MS ||
    nowMs - snapshot.generatedAtMs >= MAX_AGE_MS ||
    snapshot.glucoseTimestampMs > nowMs + 2 * MINUTE_MS ||
    snapshot.generatedAtMs > nowMs + 2 * MINUTE_MS) {
    return undefined;
  }
  return {
    ...snapshot,
    series: snapshot.series.filter(series =>
      Number.isFinite(series.sourceTimestampMs) &&
      nowMs - series.sourceTimestampMs < MAX_AGE_MS &&
      series.sourceTimestampMs <= nowMs + 2 * MINUTE_MS,
    ).map(series => ({
      ...series,
      points: series.points.filter(point => point.ts > nowMs),
    })).filter(series => series.points.length > 0),
  };
};

export const useGlucoseForecast = ({
  source,
  live,
  nowMs,
  glucoseTimestampMs,
}: {
  readonly source: DayGraphDataSource;
  readonly live: boolean;
  readonly nowMs: number;
  readonly glucoseTimestampMs?: number | undefined;
}) => {
  const [state, setState] = useState<ForecastState>();
  const [revision, setRevision] = useState(0);
  const busy = useRef(false);
  const forceRefreshNext = useRef(false);
  const refresh = useCallback((forceRefresh = true) => {
    if (!busy.current) {
      forceRefreshNext.current = forceRefresh;
      setRevision(value => value + 1);
    }
  }, []);
  useEffect(() => {
    if (!live || !source.loadGlucoseForecast) {
      setState(undefined);
      return undefined;
    }
    let active = true;
    busy.current = true;
    const forceRefresh = forceRefreshNext.current;
    forceRefreshNext.current = false;
    setState(current => ({
      source,
      ...(current?.source === source && current.snapshot ? {snapshot: current.snapshot} : {}),
      loading: true,
      failed: false,
    }));
    Promise.resolve()
      .then(() => source.loadGlucoseForecast!({forceRefresh}))
      .then(snapshot => {
        if (active) {
          setState({source, snapshot, loading: false, failed: false});
        }
      })
      .catch(() => {
        if (active) {
          setState({source, loading: false, failed: true});
        }
      })
      .finally(() => {
        if (active) {
          busy.current = false;
        }
      });
    return () => {
      active = false;
      busy.current = false;
    };
  }, [source, live, glucoseTimestampMs, revision]);
  useEffect(() => {
    if (!live || !source.loadGlucoseForecast) {
      return undefined;
    }
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        refresh(false);
      }
    }, 5 * MINUTE_MS);
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active') {
        refresh(false);
      }
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [source, live, refresh]);
  const current = live && state?.source === source ? state : undefined;
  const snapshot = visibleGlucoseForecast(current?.snapshot, nowMs);
  return {
    snapshot,
    supported: live && !!source.loadGlucoseForecast,
    status: !current || current.loading ? 'loading' as const :
      current.failed ? 'error' as const : !snapshot ? 'stale' as const : 'ready' as const,
    refresh,
  };
};
