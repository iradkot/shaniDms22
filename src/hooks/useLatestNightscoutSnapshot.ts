import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {AppState} from 'react-native';

import {nativeCurrentDataSource} from 'app/services/currentData/nativeCurrentDataSource';
import type {CurrentDataSnapshot} from '../modules/currentData';
import {
  getNightscoutBaseUrl,
  getNightscoutConfigurationRevision,
  subscribeNightscoutConfiguration,
} from 'app/api/shaniNightscoutInstances';
import {BgSample} from 'app/types/day_bgs.types';
import {DeviceStatusEntry} from 'app/types/deviceStatus.types';
import {futureLoopPoints} from '../modules/glucoseForecast';
import {
  assertActiveNightscoutCacheScope,
  createNightscoutCacheScope,
} from 'app/services/nightscoutCacheScope';

const POLL_INTERVAL_MS = 60 * 1000;
const EMPTY_STATE_RETRY_MS = 15 * 1000;
const STALE_WARNING_MS = 10 * 60 * 1000;
const STALE_HIDE_PREDICTION_MS = 15 * 60 * 1000;

export type SnapshotStaleLevel = 'fresh' | 'stale' | 'very-stale';

export type PredictedBgPoint = {
  /** Predicted BG timestamp (ms). */
  ts: number;
  /** Predicted BG value (mg/dL). */
  sgv: number;
};

export type LatestNightscoutSnapshot = {
  /** Captured native source identity for foreground consumers; never model evidence. */
  configurationRevision?: number;
  sourceBaseUrl?: string;
  /** Shared current observations, including each source clock and availability. */
  currentData?: CurrentDataSnapshot;
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

function computeStaleLevel(
  bgTimestampMs: number,
  nowMs: number,
): SnapshotStaleLevel {
  const ageMs = nowMs - bgTimestampMs;
  if (ageMs >= STALE_HIDE_PREDICTION_MS) {
    return 'very-stale';
  }
  if (ageMs >= STALE_WARNING_MS) {
    return 'stale';
  }
  return 'fresh';
}

function extractPredictionPoints(params: {
  deviceStatus: DeviceStatusEntry | null;
  nowMs: number;
}): PredictedBgPoint[] {
  const {deviceStatus, nowMs} = params;
  return futureLoopPoints(deviceStatus, nowMs).slice(0, 3);
}

/**
 * Polls the Nightscout "latest" endpoints (entries + devicestatus) and maps them
 * into a small UI-friendly snapshot.
 *
 * Polling behavior (PRD):
 * - Poll every 60s when enabled (typically collapsed mode)
 * - Refresh immediately after background/inactive -> active, even without interval polling
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
  const configurationRevision = useSyncExternalStore(
    subscribeNightscoutConfiguration,
    getNightscoutConfigurationRevision,
    getNightscoutConfigurationRevision,
  );

  const [snapshot, setSnapshot] = useState<LatestNightscoutSnapshot | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const generationRef = useRef(0);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<{
    sourceIdentity: string;
    requestId: number;
  } | null>(null);

  // Reset before paint on source/account changes and credential corrections.
  // Invalidating pending work lets a corrected credential retry immediately.
  useLayoutEffect(() => {
    generationRef.current += 1;
    inFlightRef.current = null;
    setSnapshot(null);
    setIsLoading(false);
    setError(null);
  }, [configurationRevision]);

  const refresh = useCallback(async () => {
    if (configurationRevision !== getNightscoutConfigurationRevision()) {
      return;
    }
    const sourceBaseUrl = getNightscoutBaseUrl();
    const cacheScope = createNightscoutCacheScope(sourceBaseUrl);
    if (!cacheScope) {
      return;
    }
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
      configurationRevision === getNightscoutConfigurationRevision() &&
      generationRef.current === generation &&
      inFlightRef.current?.sourceIdentity === request.sourceIdentity &&
      inFlightRef.current?.requestId === request.requestId;

    setIsLoading(true);
    setError(null);

    try {
      assertActiveNightscoutCacheScope(cacheScope);
      const currentData = await nativeCurrentDataSource.loadCurrent();

      if (!isCurrentRequest()) {
        return;
      }
      assertActiveNightscoutCacheScope(cacheScope);

      const bg = currentData.glucoseReading;
      const deviceStatus = currentData.deviceStatus as DeviceStatusEntry | null;
      if (!bg || currentData.glucose.status === 'unavailable') {
        setSnapshot(null);
        if (currentData.glucose.reason === 'read-failed') {
          setError(new Error('Current glucose could not be loaded.'));
        }
        return;
      }

      const nowMs = currentData.observedAtMs;
      const staleLevel = computeStaleLevel(bg.date, nowMs);

      const enrichedBg: BgSample = {
        ...bg,
        ...(currentData.iob.status === 'fresh' && currentData.iob.value !== null
          ? {iob: currentData.iob.value}
          : {}),
        ...(currentData.cob.status === 'fresh' && currentData.cob.value !== null
          ? {cob: currentData.cob.value}
          : {}),
      };

      const shouldHidePredictions =
        staleLevel === 'very-stale' || currentData.glucose.status !== 'fresh';

      const predictions = shouldHidePredictions
        ? []
        : extractPredictionPoints({deviceStatus, nowMs});

      setSnapshot({
        configurationRevision,
        ...(sourceBaseUrl ? {sourceBaseUrl} : {}),
        currentData,
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
  }, [configurationRevision]);

  useEffect(() => {
    refresh();
    return () => {
      generationRef.current += 1;
      inFlightRef.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    let previousState = AppState.currentState;
    let active = true;
    const subscription = AppState.addEventListener('change', nextState => {
      const resumed =
        (previousState === 'background' || previousState === 'inactive') &&
        nextState === 'active';
      previousState = nextState;
      if (active && resumed) {
        refresh();
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [refresh]);

  useEffect(() => {
    if (!pollingEnabled) {
      return;
    }

    const id = setInterval(() => {
      refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [pollingEnabled, refresh]);

  useEffect(() => {
    if (!pollingEnabled) {
      return;
    }
    if (snapshot?.bg) {
      return;
    }

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
