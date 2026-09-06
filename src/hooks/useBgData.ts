import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useSyncExternalStore,
} from 'react';
import {bgSortFunction} from 'app/utils/bg.utils';
import type {BgSample} from 'app/types/day_bgs.types';
import {fetchBgDataForDate} from 'app/api/apiRequests';
import {
  getNightscoutConfigurationRevision,
  subscribeNightscoutConfiguration,
} from 'app/api/shaniNightscoutInstances';
import {loadInsulinContext} from 'app/services/insulin/insulinDataSource';
import {mergeDeviceStatusIntoBgSamples} from 'app/utils/mergeDeviceStatusIntoBgSamples.utils';

interface State {
  todayBgData: BgSample[];
  bgData: BgSample[];
  isLoading: boolean;
  latestBgSample: BgSample | null;
  latestPrevBgSample: BgSample | null;
  error: string | null;
}

type Action =
  | {type: 'setBgData'; payload: BgSample[]; isToday: boolean}
  | {type: 'loading'}
  | {type: 'error'}
  | {type: 'reset'; keepToday: boolean};

const initialState: State = {
  todayBgData: [],
  bgData: [],
  isLoading: false,
  latestBgSample: null,
  latestPrevBgSample: null,
  error: null,
};

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'setBgData':
      return {
        ...state,
        bgData: action.payload,
        ...(action.isToday
          ? {
              todayBgData: action.payload,
              latestBgSample: action.payload[0] ?? null,
              latestPrevBgSample: action.payload[1] ?? null,
            }
          : {}),
        isLoading: false,
        error: null,
      };
    case 'loading':
      return {...state, isLoading: true, error: null};
    case 'error':
      return {
        ...state,
        isLoading: false,
        error: 'Glucose data could not be loaded.',
      };
    case 'reset':
      return {
        ...initialState,
        ...(action.keepToday
          ? {
              todayBgData: state.todayBgData,
              latestBgSample: state.latestBgSample,
              latestPrevBgSample: state.latestPrevBgSample,
            }
          : {}),
      };
  }
};

/** Glucose and the other Home consumers share one day-scoped insulin request. */
export const useBgData = (currentDate: Date) => {
  const revision = useSyncExternalStore(
    subscribeNightscoutConfiguration,
    getNightscoutConfigurationRevision,
    getNightscoutConfigurationRevision,
  );
  const dateMs = currentDate.getTime();
  const period = useMemo(() => {
    const start = new Date(dateMs);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return {startMs: +start, endMs: +end};
  }, [dateMs]);
  const [state, dispatch] = useReducer(reducer, initialState);
  const generation = useRef(0);
  const mounted = useRef(false);
  const previousRevision = useRef(revision);
  const scopeKey = `${revision}:${period.startMs}:${period.endMs}`;
  const activeScope = useRef(scopeKey);
  activeScope.current = scopeKey;

  useLayoutEffect(() => {
    mounted.current = true;
    generation.current += 1;
    dispatch({type: 'reset', keepToday: previousRevision.current === revision});
    previousRevision.current = revision;
    return () => {
      mounted.current = false;
      generation.current += 1;
    };
  }, [period, revision]);

  const load = useCallback(
    async (forceRefresh: boolean) => {
      if (
        !mounted.current ||
        revision !== getNightscoutConfigurationRevision() ||
        activeScope.current !== scopeKey
      ) {
        return;
      }
      const request = ++generation.current;
      const isCurrent = () =>
        mounted.current &&
        request === generation.current &&
        activeScope.current === scopeKey &&
        revision === getNightscoutConfigurationRevision();
      dispatch({type: 'loading'});
      try {
        const [bgData, context] = await Promise.all([
          fetchBgDataForDate(new Date(dateMs)),
          loadInsulinContext({...period, forceRefresh}),
        ]);
        if (!isCurrent()) {
          return;
        }
        const enriched = mergeDeviceStatusIntoBgSamples({
          bgSamples: [...bgData].sort(bgSortFunction(false)),
          deviceStatus: [...context.deviceStatus],
        });
        dispatch({
          type: 'setBgData',
          payload: enriched,
          isToday:
            new Date(dateMs).toDateString() === new Date().toDateString(),
        });
      } catch {
        if (isCurrent()) {
          dispatch({type: 'error'});
        }
      }
    },
    [dateMs, period, revision, scopeKey],
  );

  useEffect(() => {
    load(false);
  }, [load]);
  const getUpdatedBgData = useCallback(() => load(true), [load]);
  return {...state, getUpdatedBgData};
};
