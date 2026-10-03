import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {getLocalDayPeriod, localDayStart} from '../../modules/dailyOverview';
import type {TrendsRangeThresholds} from '../../modules/trends';
import {
  buildHomeTodayData,
  buildHomeWeeklyGlucoseData,
  getHomeCompletedWeekPeriod,
  HOME_TODAY_REFRESH_MS,
  loadHomeWeeklyInsulinData,
  type HomeDataSources,
  type HomeDataWidgetId,
  type HomeLaneState,
  type HomeTodayData,
  type HomeWeeklyGlucoseData,
  type HomeWeeklyInsulinData,
} from './homeData';

interface ScopedLane<T> {
  readonly scopeKey: string;
  readonly source: object;
  readonly rangeKey: string;
  readonly requestKey: string;
  readonly refreshSequence: number;
  readonly value: HomeLaneState<T>;
}

const useHomeLane = <T>({
  enabled,
  source,
  scopeKey,
  rangeKey,
  requestKey,
  refreshSequence,
  load,
}: {
  readonly enabled: boolean;
  readonly source: object | undefined;
  readonly scopeKey: string;
  readonly rangeKey: string;
  readonly requestKey: string;
  readonly refreshSequence: number;
  readonly load: (isCurrent: () => boolean) => Promise<T>;
}): HomeLaneState<T> => {
  const [state, setState] = useState<ScopedLane<T>>();
  useEffect(() => {
    if (!enabled || source === undefined) {
      return undefined;
    }
    let active = true;
    const identity = {scopeKey, source, rangeKey, requestKey, refreshSequence};
    const matches = (current: ScopedLane<T> | undefined): boolean =>
      current?.source === source &&
      current.scopeKey === scopeKey &&
      current.rangeKey === rangeKey;
    setState(current => ({
      ...identity,
      value:
        matches(current) && current?.value.kind === 'ready'
          ? {...current.value, refreshing: true, refreshFailed: false}
          : {kind: 'loading'},
    }));
    load(() => active).then(
      data => {
        if (active) {
          setState({
            ...identity,
            value: {
              kind: 'ready',
              data,
              refreshing: false,
              refreshFailed: false,
            },
          });
        }
      },
      () => {
        if (active) {
          setState(current => ({
            ...identity,
            value:
              matches(current) && current?.value.kind === 'ready'
                ? {...current.value, refreshing: false, refreshFailed: true}
                : {kind: 'error'},
          }));
        }
      },
    );
    return () => {
      active = false;
    };
  }, [enabled, source, scopeKey, rangeKey, requestKey, refreshSequence, load]);

  if (!enabled || source === undefined) {
    return {kind: 'unavailable', reason: enabled ? 'source' : 'hidden'};
  }
  if (
    state?.source !== source ||
    state.scopeKey !== scopeKey ||
    state.rangeKey !== rangeKey
  ) {
    return {kind: 'loading'};
  }
  if (
    state.value.kind === 'ready' &&
    (state.requestKey !== requestKey ||
      state.refreshSequence !== refreshSequence)
  ) {
    return {...state.value, refreshing: true, refreshFailed: false};
  }
  return state.value;
};

export interface UseHomeDataInput {
  readonly sources: HomeDataSources;
  readonly thresholds: TrendsRangeThresholds;
  readonly enabledWidgetIds: readonly HomeDataWidgetId[];
  readonly scopeKey: string;
  readonly nowMs: number;
  readonly refreshSequence: number;
}

export interface HomeDataState {
  readonly today: HomeLaneState<HomeTodayData>;
  readonly weeklyGlucose: HomeLaneState<HomeWeeklyGlucoseData>;
  readonly weeklyInsulin: HomeLaneState<HomeWeeklyInsulinData>;
}

/**
 * A card order/style change is not a data request. Each visible lane has its
 * own source, refresh clock and cancellation scope; no timer lives here.
 */
export const useHomeData = (input: UseHomeDataInput): HomeDataState => {
  const {dailyOverview, trends} = input.sources;
  const {scopeKey, nowMs, refreshSequence, enabledWidgetIds} = input;
  const latestNow = useRef(nowMs);
  latestNow.current = nowMs;
  const dayStartMs = localDayStart(nowMs);
  const todayPeriod = useMemo(
    () => getLocalDayPeriod(dayStartMs),
    [dayStartMs],
  );
  const weekPeriod = useMemo(
    () => getHomeCompletedWeekPeriod(dayStartMs),
    [dayStartMs],
  );
  const todayBucket = Math.floor(nowMs / HOME_TODAY_REFRESH_MS);
  const {veryLowMaxMgDl, targetMinMgDl, targetMaxMgDl, highMaxMgDl} =
    input.thresholds;
  const thresholds = useMemo(
    () => ({
      veryLowMaxMgDl,
      targetMinMgDl,
      targetMaxMgDl,
      highMaxMgDl,
    }),
    [veryLowMaxMgDl, targetMinMgDl, targetMaxMgDl, highMaxMgDl],
  );
  const glucoseRangeKey = `${dayStartMs}:${veryLowMaxMgDl}:${targetMinMgDl}:${targetMaxMgDl}:${highMaxMgDl}`;
  const todayEnabled = enabledWidgetIds.some(
    id =>
      id === 'glucose-graph' ||
      id === 'time-in-range' ||
      id === 'daily-insulin',
  );
  const weeklyGlucoseEnabled = enabledWidgetIds.includes('weekly-glucose');
  const weeklyInsulinEnabled = enabledWidgetIds.includes('weekly-insulin');

  const loadToday = useCallback(async (): Promise<HomeTodayData> => {
    if (!dailyOverview) {
      throw new Error('The daily source is unavailable.');
    }
    const observedEndMs = Math.max(
      todayPeriod.startMs,
      Math.min(latestNow.current, todayPeriod.endMs),
    );
    const source =
      observedEndMs > todayPeriod.startMs
        ? await dailyOverview.loadDailyOverview({
            startMs: todayPeriod.startMs,
            endMs: observedEndMs,
          })
        : {
            glucoseSamples: [],
            insulinSummary: {quality: 'unavailable' as const},
          };
    return buildHomeTodayData({
      period: todayPeriod,
      observedEndMs,
      source,
      thresholds,
    });
  }, [dailyOverview, todayPeriod, thresholds]);

  const loadWeeklyGlucose =
    useCallback(async (): Promise<HomeWeeklyGlucoseData> => {
      if (!trends) {
        throw new Error('The glucose source is unavailable.');
      }
      const samples = await trends.loadGlucoseSamples(weekPeriod);
      return buildHomeWeeklyGlucoseData(weekPeriod, samples, thresholds);
    }, [trends, weekPeriod, thresholds]);

  const loadWeeklyInsulin = useCallback(
    async (isCurrent: () => boolean): Promise<HomeWeeklyInsulinData> => {
      if (!dailyOverview) {
        throw new Error('The daily source is unavailable.');
      }
      return loadHomeWeeklyInsulinData(dailyOverview, weekPeriod, isCurrent);
    },
    [dailyOverview, weekPeriod],
  );

  const today = useHomeLane({
    enabled: todayEnabled,
    source: dailyOverview,
    scopeKey,
    rangeKey: glucoseRangeKey,
    requestKey: String(todayBucket),
    refreshSequence,
    load: loadToday,
  });
  const weeklyGlucose = useHomeLane({
    enabled: weeklyGlucoseEnabled,
    source: trends,
    scopeKey,
    rangeKey: glucoseRangeKey,
    requestKey: String(dayStartMs),
    refreshSequence,
    load: loadWeeklyGlucose,
  });
  const weeklyInsulin = useHomeLane({
    enabled: weeklyInsulinEnabled,
    source: dailyOverview,
    scopeKey,
    rangeKey: String(dayStartMs),
    requestKey: String(dayStartMs),
    refreshSequence,
    load: loadWeeklyInsulin,
  });
  return {today, weeklyGlucose, weeklyInsulin};
};
