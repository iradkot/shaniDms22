import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';
import type {
  DayGraphDataSource,
  DayGraphPeriod,
  DayGraphSnapshot,
} from '../../modules/dayGraph';

export type DayGraphLoadState =
  | {readonly kind: 'loading' | 'error'}
  | {
      readonly kind: 'ready';
      readonly snapshot: DayGraphSnapshot;
      readonly refreshing: boolean;
      readonly refreshFailed: boolean;
    };

interface ScopedState {
  readonly source: DayGraphDataSource;
  readonly period: DayGraphPeriod;
  readonly value: DayGraphLoadState;
}

const REFRESH_MS = 5 * 60 * 1000;

/** Retains the selected day's data during refresh and rejects late source/day responses. */
export const useDayGraphSnapshot = (
  source: DayGraphDataSource,
  period: DayGraphPeriod,
  live: boolean,
) => {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<ScopedState>();
  const busy = useRef(false);
  const refresh = useCallback(() => {
    if (!busy.current) {
      setReload(value => value + 1);
    }
  }, []);

  useEffect(() => {
    let active = true;
    busy.current = true;
    setState(current => ({
      source,
      period,
      value:
        current?.source === source &&
        current.period === period &&
        current.value.kind === 'ready'
          ? {...current.value, refreshing: true, refreshFailed: false}
          : {kind: 'loading'},
    }));
    const load = async () => source.loadDayGraph(period);
    load()
      .then(snapshot => {
        if (active) {
          setState({
            source,
            period,
            value: {
              kind: 'ready',
              snapshot,
              refreshing: false,
              refreshFailed: false,
            },
          });
        }
      })
      .catch(() => {
        if (active) {
          setState(current => ({
            source,
            period,
            value:
              current?.source === source &&
              current.period === period &&
              current.value.kind === 'ready'
                ? {...current.value, refreshing: false, refreshFailed: true}
                : {kind: 'error'},
          }));
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
  }, [source, period, reload]);

  useEffect(() => {
    if (!live) {
      return undefined;
    }
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') {
        refresh();
      }
    }, REFRESH_MS);
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', next => {
      if (next === 'active' && previous !== 'active') {
        refresh();
      }
      previous = next;
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [live, refresh]);

  return {
    state:
      state?.source === source && state.period === period
        ? state.value
        : ({kind: 'loading'} as DayGraphLoadState),
    refresh,
  };
};
