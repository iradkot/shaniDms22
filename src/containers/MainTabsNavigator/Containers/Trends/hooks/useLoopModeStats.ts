import {useEffect, useMemo, useState} from 'react';
import {BgSample} from 'app/types/day_bgs.types';
import {
  fetchDeviceStatusForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
} from 'app/api/apiRequests';
import {DeviceStatusEntry} from 'app/types/deviceStatus.types';
import {
  LOOP_CONTEXT_LOOKBACK_MINUTES,
  LOOP_STATUS_CARRY_FORWARD_MINUTES,
  LOOP_TREATMENT_LOOKBACK_MINUTES,
  LoopDataLoadProgress,
  LoopModeEvent,
  buildLoopDataFetchRanges,
  buildLoopModeEventsFromDeviceStatus,
  buildLoopModeEventsFromTreatments,
  computeLoopModeStats,
} from '../utils/loopModeStats';

export * from '../utils/loopModeStats';

const IDLE_LOAD_PROGRESS: LoopDataLoadProgress = {
  phase: 'idle',
  completedChunks: 0,
  totalChunks: 0,
};

export function useLoopModeStats({
  start,
  end,
  bgData,
}: {
  start: Date;
  end: Date;
  bgData: BgSample[];
}) {
  const [events, setEvents] = useState<LoopModeEvent[]>([]);
  const [eventsRangeKey, setEventsRangeKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [rowsFetched, setRowsFetched] = useState(0);
  const [loadProgress, setLoadProgress] =
    useState<LoopDataLoadProgress>(IDLE_LOAD_PROGRESS);
  const rangeKey = `${start.getTime()}-${end.getTime()}`;
  const hasCurrentRangeData = eventsRangeKey === rangeKey;

  useEffect(() => {
    let cancelled = false;

    async function loadLoopEvents() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const deviceStatusRanges = buildLoopDataFetchRanges({
          start,
          end,
          lookbackMinutes: LOOP_CONTEXT_LOOKBACK_MINUTES,
        });
        const treatmentRanges = buildLoopDataFetchRanges({
          start,
          end,
          lookbackMinutes: LOOP_TREATMENT_LOOKBACK_MINUTES,
        });
        const totalChunks = deviceStatusRanges.length + treatmentRanges.length;
        let rows: DeviceStatusEntry[] = [];
        let treatments: Array<Record<string, unknown>> = [];
        let completedChunks = 0;

        setLoadProgress({
          phase: 'deviceStatus',
          completedChunks: 0,
          totalChunks,
        });

        for (const range of deviceStatusRanges) {
          rows = rows.concat(
            await fetchDeviceStatusForDateRangeUncached(range.start, range.end, {
              throwOnError: true,
            }),
          );
          completedChunks += 1;
          if (!cancelled) {
            setLoadProgress({
              phase: 'deviceStatus',
              completedChunks,
              totalChunks,
            });
          }
        }

        if (!cancelled) {
          setLoadProgress({
            phase: 'treatments',
            completedChunks,
            totalChunks,
          });
        }

        for (const range of treatmentRanges) {
          treatments = treatments.concat(
            await fetchTreatmentsForDateRangeUncached(range.start, range.end),
          );
          completedChunks += 1;
          if (!cancelled) {
            setLoadProgress({
              phase: 'treatments',
              completedChunks,
              totalChunks,
            });
          }
        }

        if (!cancelled) {
          setLoadProgress({
            phase: 'processing',
            completedChunks,
            totalChunks,
          });
        }

        const normalized = [
          ...buildLoopModeEventsFromDeviceStatus(rows),
          ...buildLoopModeEventsFromTreatments(treatments),
        ].sort((a, b) => a.timestamp - b.timestamp);

        if (!cancelled) {
          setRowsFetched(rows.length + treatments.length);
          setEvents(normalized);
          setEventsRangeKey(rangeKey);
          setFetchError(null);
          setLoadProgress({
            phase: 'done',
            completedChunks: totalChunks,
            totalChunks,
          });
        }
      } catch (error: any) {
        if (!cancelled) {
          setRowsFetched(0);
          setEvents([]);
          setEventsRangeKey(rangeKey);
          setFetchError(error?.message ?? String(error ?? 'Unknown error'));
          setLoadProgress(current => ({
            ...current,
            phase: 'error',
          }));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadLoopEvents();

    return () => {
      cancelled = true;
    };
  }, [end, rangeKey, start]);

  const stats = useMemo(() => {
    return computeLoopModeStats({
      start,
      end,
      bgData,
      events: hasCurrentRangeData ? events : [],
      maxCarryForwardMinutes: LOOP_STATUS_CARRY_FORWARD_MINUTES,
      initialContextLookbackMinutes: LOOP_CONTEXT_LOOKBACK_MINUTES,
    });
  }, [bgData, end, events, hasCurrentRangeData, start]);

  return {
    stats,
    isLoading: isLoading || !hasCurrentRangeData,
    fetchError,
    rowsFetched: hasCurrentRangeData ? rowsFetched : 0,
    loadProgress:
      hasCurrentRangeData || isLoading ? loadProgress : IDLE_LOAD_PROGRESS,
  };
}
