import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  fetchLatestBgEntry,
  fetchLatestDeviceStatusEntry,
} from 'app/api/apiRequests';
import {
  getNightscoutBaseUrl,
  subscribeNightscoutConfiguration,
} from 'app/api/shaniNightscoutInstances';
import {BgSample} from 'app/types/day_bgs.types';
import {DeviceStatusEntry} from 'app/types/deviceStatus.types';
import {
  extractLoad,
  getDeviceStatusTimestampMs,
} from 'app/utils/mergeDeviceStatusIntoBgSamples.utils';
import {
  assertActiveNightscoutCacheScope,
  createNightscoutCacheScope,
} from 'app/services/nightscoutCacheScope';

const POLL_INTERVAL_MS = 60 * 1000;
const EMPTY_STATE_RETRY_MS = 15 * 1000;
const STALE_WARNING_MS = 10 * 60 * 1000;
const STALE_HIDE_PREDICTION_MS = 15 * 60 * 1000;
const DEFAULT_PREDICTION_STEP_MS = 5 * 60 * 1000;

export type SnapshotStaleLevel = 'fresh' | 'stale' | 'very-stale';

export type PredictedBgPoint = {
  /** Predicted BG timestamp (ms). */
  ts: number;
  /** Predicted BG value (mg/dL). */
  sgv: number;
};

export type LatestNightscoutSnapshot = {
  bg: BgSample;
  /** Latest device status entry, if available. */
  deviceStatus: DeviceStatusEntry | null;
  /** BG sample enriched with IOB/COB fields (best-effort). */
  enrichedBg: BgSample;
  /** Up to 3 future prediction points (roughly next ~15 minutes). */
  predictions: PredictedBgPoint[];
  /** Staleness derived from latest BG timestamp. */
  staleLevel: SnapshotStaleLevel;
};

function clampFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function coerceTimestampMs(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : undefined;
  }
  return undefined;
}

function computeStaleLevel(bgTimestampMs: number, nowMs: number): SnapshotStaleLevel {
  const ageMs = nowMs - bgTimestampMs;
  if (ageMs >= STALE_HIDE_PREDICTION_MS) return 'very-stale';
  if (ageMs >= STALE_WARNING_MS) return 'stale';
  return 'fresh';
}

function extractPredictionPoints(params: {
  deviceStatus: DeviceStatusEntry | null;
  nowMs: number;
}): PredictedBgPoint[] {
  const {deviceStatus, nowMs} = params;
  const predicted = deviceStatus?.loop?.predicted;
  const values = Array.isArray(predicted?.values) ? predicted?.values : undefined;
  if (!values?.length) return [];

  const tsRaw = Array.isArray(predicted?.timestamps)
    ? predicted?.timestamps
    : undefined;
  const deviceTs = deviceStatus ? getDeviceStatusTimestampMs(deviceStatus) : undefined;
  const baseTs = deviceTs ?? nowMs;

  const points: PredictedBgPoint[] = values
    .map((v, idx) => {
      const sgv = clampFiniteNumber(v);
      if (sgv == null) return null;

      const tsFromPayload = tsRaw?.[idx] != null ? coerceTimestampMs(tsRaw[idx]) : undefined;
      const ts = tsFromPayload ?? baseTs + idx * DEFAULT_PREDICTION_STEP_MS;

      return Number.isFinite(ts) ? {ts, sgv: Math.round(sgv)} : null;
    })
    .filter((x): x is PredictedBgPoint => Boolean(x));

  // PRD: filter out predictions in the past (date > now)
  const future = points.filter(p => p.ts > nowMs);

  // PRD: show 3-step prediction (~15 minutes)
  return future.slice(0, 3);
}

/**
 * Polls the Nightscout "latest" endpoints (entries + devicestatus) and maps them
 * into a small UI-friendly snapshot.
 *
 * Polling behavior (PRD):
 * - Poll every 60s when enabled (typically collapsed mode)
 * - Stale rules are based on BG timestamp (10m warning, 15m hide predictions)
 */
export function useLatestNightscoutSnapshot(params: {
  /** When false, no interval polling is performed. */
  pollingEnabled: boolean;
}): {
  snapshot: LatestNightscoutSnapshot | null;
  isLoading: boolean;
  error: unknown;
  refresh: () => Promise<void>;
} {
  const {pollingEnabled} = params;
  const configuredBaseUrl = useSyncExternalStore(
    subscribeNightscoutConfiguration,
    getNightscoutBaseUrl,
    getNightscoutBaseUrl,
  );
  const cacheScope = useMemo(
    () => createNightscoutCacheScope(configuredBaseUrl),
    [configuredBaseUrl],
  );
  const sourceIdentity = cacheScope?.sourceIdentity ?? null;

  const [snapshot, setSnapshot] = useState<LatestNightscoutSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const generationRef = useRef(0);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<{
    sourceIdentity: string;
    requestId: number;
  } | null>(null);

  // Reset before paint so a newly selected Workspace can never render the
  // previous Data Subject's snapshot while its own request is starting.
  useLayoutEffect(() => {
    generationRef.current += 1;
    inFlightRef.current = null;
    setSnapshot(null);
    setIsLoading(false);
    setError(null);
  }, [sourceIdentity]);

  const refresh = useCallback(async () => {
    if (!cacheScope) return;
    if (inFlightRef.current?.sourceIdentity === cacheScope.sourceIdentity) {
      return;
    }

    const generation = generationRef.current;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const request = {
      sourceIdentity: cacheScope.sourceIdentity,
      requestId,
    };
    inFlightRef.current = request;

    const isCurrentRequest = () =>
      generationRef.current === generation &&
      inFlightRef.current?.sourceIdentity === request.sourceIdentity &&
      inFlightRef.current?.requestId === request.requestId;

    setIsLoading(true);
    setError(null);

    try {
      assertActiveNightscoutCacheScope(cacheScope);
      const [bg, deviceStatus] = await Promise.all([
        fetchLatestBgEntry(),
        fetchLatestDeviceStatusEntry(),
      ]);

      if (!isCurrentRequest()) return;
      assertActiveNightscoutCacheScope(cacheScope);

      if (!bg) {
        setSnapshot(null);
        return;
      }

      const nowMs = Date.now();
      const staleLevel = computeStaleLevel(bg.date, nowMs);

      const load = deviceStatus ? extractLoad(deviceStatus) : {};
      const enrichedBg: BgSample = {
        ...bg,
        ...load,
      };

      const shouldHidePredictions =
        staleLevel === 'very-stale' ||
        (() => {
          const deviceTs = deviceStatus ? getDeviceStatusTimestampMs(deviceStatus) : undefined;
          return typeof deviceTs === 'number'
            ? nowMs - deviceTs >= STALE_HIDE_PREDICTION_MS
            : false;
        })();

      const predictions = shouldHidePredictions
        ? []
        : extractPredictionPoints({deviceStatus, nowMs});

      setSnapshot({
        bg,
        deviceStatus,
        enrichedBg,
        predictions,
        staleLevel,
      });
    } catch (e) {
      if (isCurrentRequest()) {
        setError(e);
      }
    } finally {
      if (isCurrentRequest()) {
        setIsLoading(false);
        inFlightRef.current = null;
      }
    }
  }, [cacheScope]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!pollingEnabled) return;

    const id = setInterval(() => {
      refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [pollingEnabled, refresh]);

  useEffect(() => {
    if (!pollingEnabled) return;
    if (snapshot?.bg) return;

    const retryId = setInterval(() => {
      refresh();
    }, EMPTY_STATE_RETRY_MS);

    return () => clearInterval(retryId);
  }, [pollingEnabled, snapshot?.bg, refresh]);

  return useMemo(
    () => ({
      snapshot,
      isLoading,
      error,
      refresh,
    }),
    [snapshot, isLoading, error, refresh],
  );
}
