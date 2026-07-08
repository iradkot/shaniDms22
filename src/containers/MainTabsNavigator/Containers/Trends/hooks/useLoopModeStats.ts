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
  LoopModeEvent,
  buildLoopDataFetchRanges,
  buildLoopModeEventsFromDeviceStatus,
  buildLoopModeEventsFromTreatments,
  computeLoopModeStats,
} from '../utils/loopModeStats';

export * from '../utils/loopModeStats';

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
        let rows: DeviceStatusEntry[] = [];
        let treatments: Array<Record<string, unknown>> = [];

        for (const range of deviceStatusRanges) {
          rows = rows.concat(
            await fetchDeviceStatusForDateRangeUncached(range.start, range.end, {
              throwOnError: true,
            }),
          );
        }

        for (const range of treatmentRanges) {
          treatments = treatments.concat(
            await fetchTreatmentsForDateRangeUncached(range.start, range.end),
          );
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
        }
      } catch (error: any) {
        if (!cancelled) {
          setRowsFetched(0);
          setEvents([]);
          setEventsRangeKey(rangeKey);
          setFetchError(error?.message ?? String(error ?? 'Unknown error'));
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
  };
}
