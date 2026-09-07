import {useCallback, useEffect, useMemo, useState} from 'react';
import {
  buildDayGraphCalendar,
  moveLocalDays,
  periodForLocalMonth,
  type DayGraphCalendarDay,
  type DayGraphDataSource,
  type DayGraphSnapshot,
} from '../../modules/dayGraph';
import type {TrendsRangeThresholds} from '../../modules/trends';

interface CalendarSummary {
  readonly days: readonly DayGraphCalendarDay[];
  readonly stale: boolean;
  readonly storedAtMs: number;
}
interface CalendarState {
  readonly cache: Map<string, CalendarSummary>;
  readonly key: string;
  readonly summary?: CalendarSummary | undefined;
  readonly loading: boolean;
  readonly failed: boolean;
}
const CACHE_TTL_MS = 5 * 60_000;
const MAX_CACHED_MONTHS = 3;

/** Loads only while open; retains three tiny summaries, never additional raw CGM history. */
export const useDayGraphCalendar = ({
  source,
  open,
  monthStartMs,
  nowMs,
  thresholds,
  expectedSampleIntervalMs,
  selectedDaySnapshot,
}: {
  readonly source: DayGraphDataSource;
  readonly open: boolean;
  readonly monthStartMs: number;
  readonly nowMs: number;
  readonly thresholds: TrendsRangeThresholds;
  readonly expectedSampleIntervalMs: number;
  readonly selectedDaySnapshot?: DayGraphSnapshot | undefined;
}) => {
  // Data-source identity is the account/source seam: never share patient summaries.
  const cacheScope = useMemo(
    () => ({source, summaries: new Map<string, CalendarSummary>()}),
    [source],
  );
  const cache = cacheScope.summaries;
  const [state, setState] = useState<CalendarState>();
  const [reload, setReload] = useState(0);
  const month = useMemo(
    () => periodForLocalMonth(monthStartMs),
    [monthStartMs],
  );
  const fetchEndMs = Math.min(month.dayEndMs, moveLocalDays(nowMs, 1));
  const key = `${month.dayStartMs}:${fetchEndMs}:${expectedSampleIntervalMs}:${thresholds.veryLowMaxMgDl}:${thresholds.targetMinMgDl}:${thresholds.targetMaxMgDl}:${thresholds.highMaxMgDl}`;
  const retry = useCallback(() => {
    const previous = cache.get(key);
    if (previous) {
      cache.set(key, {...previous, stale: true});
    }
    setReload(value => value + 1);
  }, [cache, key]);
  // Refresh the captured clock when opening/navigating; a minute tick must not restart a download.
  const request = useMemo(
    () => ({nowMs, thresholds, expectedSampleIntervalMs}),
    // The scalar key includes every metric setting, not the changing object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, open, reload],
  );

  useEffect(() => {
    if (
      !open ||
      !source.loadCalendarGlucose ||
      fetchEndMs <= month.dayStartMs
    ) {
      return undefined;
    }
    const previous = cache.get(key);
    if (
      previous &&
      !previous.stale &&
      request.nowMs - previous.storedAtMs >= 0 &&
      request.nowMs - previous.storedAtMs < CACHE_TTL_MS
    ) {
      setState({cache, key, summary: previous, loading: false, failed: false});
      return undefined;
    }
    let active = true;
    const controller = new AbortController();
    setState({cache, key, summary: previous, loading: true, failed: false});
    Promise.resolve()
      .then(() =>
        source.loadCalendarGlucose!(
          {dayStartMs: month.dayStartMs, dayEndMs: fetchEndMs},
          {signal: controller.signal},
        ),
      )
      .then(snapshot => {
        if (!active) {
          return;
        }
        const summary: CalendarSummary = {
          days: buildDayGraphCalendar({
            monthStartMs: month.dayStartMs,
            snapshot,
            ...request,
          }),
          stale: snapshot.freshness.kind === 'stale' || !snapshot.complete,
          storedAtMs: request.nowMs,
        };
        cache.delete(key);
        cache.set(key, summary);
        while (cache.size > MAX_CACHED_MONTHS) {
          cache.delete(cache.keys().next().value!);
        }
        setState({cache, key, summary, loading: false, failed: summary.stale});
      })
      .catch(() => {
        if (active) {
          setState({
            cache,
            key,
            summary: previous,
            loading: false,
            failed: true,
          });
        }
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [cache, source, open, key, month.dayStartMs, fetchEndMs, request, reload]);

  const current =
    state?.cache === cache && state.key === key ? state : undefined;
  const summary = current?.summary ?? cache.get(key);
  const days = useMemo(() => {
    if (!open) {
      return [];
    }
    const known = buildDayGraphCalendar({
      monthStartMs: month.dayStartMs,
      ...request,
      snapshot: selectedDaySnapshot
        ? {
            glucoseSamples: selectedDaySnapshot.glucoseSamples,
            freshness: selectedDaySnapshot.freshness,
            complete: false,
          }
        : undefined,
    });
    // Already-visible glucose remains discoverable even if a month cannot load offline.
    return summary
      ? summary.days.map((day, index) =>
          day.status !== 'data' && known[index]?.status === 'data'
            ? known[index]!
            : day,
        )
      : known;
  }, [open, month.dayStartMs, request, selectedDaySnapshot, summary]);
  return {
    days,
    loading: open && !!source.loadCalendarGlucose && (current?.loading ?? true),
    failed: current?.failed ?? false,
    stale:
      days.some(day => day.status === 'data') &&
      (summary?.stale === true ||
        current?.failed === true ||
        (!summary && selectedDaySnapshot?.freshness.kind === 'stale')),
    retry,
  };
};
