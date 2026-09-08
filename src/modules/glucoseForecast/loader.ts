import {buildGlucoseForecast} from './forecast';
import {decodeForecastDeviceStatus} from './nightscout';
import type {
  ForecastContextEvent,
  ForecastDeviceStatus,
  ForecastReading,
  GlucoseForecastSnapshot,
} from './types';

const MIN = 60_000;
const DAY = 1440 * MIN;
interface ForecastLoaderDependencies {
  readonly getScopeKey: () => string;
  readonly now?: () => number;
  readonly readGlucose: (
    startMs: number,
    endMs: number,
  ) => Promise<readonly ForecastReading[]>;
  readonly readDeviceStatus: (
    startMs: number,
    endMs: number,
  ) => Promise<readonly unknown[]>;
  readonly readContextEvents?: (
    startMs: number,
    endMs: number,
  ) => readonly ForecastContextEvent[];
  readonly onSnapshot?: (snapshot: GlucoseForecastSnapshot) => void;
  /** Allows fixtures/offline hosts to opt out of optional historical status warming. */
  readonly warmDeviceHistory?: boolean;
}

/** Isolated per host/source instance. No remote writes or backend history storage. */
export function createGlucoseForecastLoader(
  dependencies: ForecastLoaderDependencies,
) {
  const now = dependencies.now ?? Date.now;
  let scope: string | undefined;
  let glucose: ForecastReading[] = [];
  let statuses: ForecastDeviceStatus[] = [];
  let historyReadAt = 0;
  let statusHistoryReadAt = 0;
  let statusHistoryEnd = 0;
  let warming: Promise<void> | undefined;
  let pending: Promise<GlucoseForecastSnapshot> | undefined;
  let last: GlucoseForecastSnapshot | undefined;

  function mergeGlucose(records: readonly ForecastReading[], at: number) {
    const map = new Map(glucose.map(p => [p.ts, p]));
    records.forEach(p => {
      if (p.ts <= at && p.ts >= at - 29 * DAY) {
        map.set(p.ts, p);
      }
    });
    glucose = [...map.values()]
      .filter(p => p.ts >= at - 29 * DAY)
      .sort((a, b) => a.ts - b.ts);
  }
  function mergeStatuses(records: readonly unknown[], at: number) {
    const map = new Map(
      statuses.map(row => [`${row.ts}:${row.loopTimestampMs ?? ''}`, row]),
    );
    records.forEach(raw => {
      const row = decodeForecastDeviceStatus(raw);
      if (row && row.ts <= at && row.ts >= at - 29 * DAY) {
        map.set(`${row.ts}:${row.loopTimestampMs ?? ''}`, row);
      }
    });
    statuses = [...map.values()]
      .filter(p => p.ts >= at - 29 * DAY)
      .sort((a, b) => a.ts - b.ts);
  }
  const build = (): GlucoseForecastSnapshot => {
    const at = now();
    return buildGlucoseForecast({
      nowMs: at,
      glucose,
      deviceStatus: statuses,
      events: dependencies.readContextEvents?.(at - 29 * DAY, at) ?? [],
    });
  };

  return (options?: {
    readonly forceRefresh?: boolean;
  }): Promise<GlucoseForecastSnapshot> => {
    const requestedScope = dependencies.getScopeKey();
    if (requestedScope !== scope) {
      scope = requestedScope;
      glucose = [];
      statuses = [];
      historyReadAt = 0;
      statusHistoryReadAt = 0;
      statusHistoryEnd = 0;
      warming = undefined;
      pending = undefined;
      last = undefined;
    }
    const assertCurrent = () => {
      if (
        dependencies.getScopeKey() !== requestedScope ||
        scope !== requestedScope
      ) {
        throw new Error('Forecast source changed during loading.');
      }
    };
    if (!options?.forceRefresh && last && now() - last.generatedAtMs < MIN) {
      return Promise.resolve(last);
    }
    if (pending) {
      return pending;
    }
    const work = (async () => {
      const at = now();
      // Current reads finish first; optional historical status never delays a visible forecast.
      const recent = await Promise.allSettled([
        dependencies.readGlucose(at - 2 * 60 * MIN, at + 1),
        dependencies.readDeviceStatus(at - 2 * 60 * MIN + 1, at + 1),
      ]);
      assertCurrent();
      if (recent[0].status === 'fulfilled') {
        mergeGlucose(recent[0].value, at);
      } else {
        throw recent[0].reason;
      }
      // Never re-stamp a failed live source as a fresh forecast from cached status.
      statuses = statuses.filter(row => row.ts < at - 15 * MIN);
      if (recent[1].status === 'fulfilled') {
        mergeStatuses(recent[1].value, at);
      }

      if (
        historyReadAt === 0 ||
        at - historyReadAt > 6 * 60 * MIN ||
        options?.forceRefresh
      ) {
        // Four bounded CGM reads, two in flight. A partial history is never labelled complete.
        for (let chunk = 0; chunk < 4; chunk += 2) {
          assertCurrent();
          const results = await Promise.allSettled(
            [chunk, chunk + 1].map(i =>
              dependencies.readGlucose(
                at - (28 - i * 7) * DAY,
                at - (21 - i * 7) * DAY,
              ),
            ),
          );
          assertCurrent();
          results.forEach(result => {
            if (result.status === 'fulfilled') {
              mergeGlucose(result.value, at);
            }
          });
        }
        historyReadAt = at;
      }
      assertCurrent();
      last = build();
      dependencies.onSnapshot?.(last);
      if (
        dependencies.warmDeviceHistory !== false &&
        !warming &&
        (statusHistoryReadAt === 0 || at - statusHistoryReadAt > 6 * 60 * MIN)
      ) {
        // Nightscout web device-status reads allow only two hours. Warm older load/Loop
        // context gradually (two requests in flight), then use it on the next live refresh.
        const start = Math.max(at - 14 * DAY, statusHistoryEnd - 2 * 60 * MIN);
        const end = at - 2 * 60 * MIN;
        let cursor = start;
        let complete = true;
        const worker = async () => {
          while (cursor < end) {
            assertCurrent();
            const chunkStart = cursor;
            cursor = Math.min(end, cursor + 2 * 60 * MIN);
            const chunkEnd = cursor;
            try {
              const result = await dependencies.readDeviceStatus(
                chunkStart,
                chunkEnd,
              );
              assertCurrent();
              mergeStatuses(result, now());
            } catch {
              assertCurrent();
              complete = false;
              // Offline/auth/source errors should not cause a large retry storm.
              cursor = end;
            }
          }
        };
        const warm = Promise.allSettled([worker(), worker()])
          .then(() => {
            assertCurrent();
            statusHistoryReadAt = at;
            if (complete) {
              statusHistoryEnd = end;
            }
            last = undefined;
          })
          .catch(() => {
            /* Obsolete work may never publish into another scope. */
          });
        warming = warm;
        warm
          .finally(() => {
            if (warming === warm) {
              warming = undefined;
            }
          })
          .catch(() => {});
      }
      return last!;
    })();
    pending = work;
    work
      .finally(() => {
        if (pending === work) {
          pending = undefined;
        }
      })
      .catch(() => {});
    return work;
  };
}
