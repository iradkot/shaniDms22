import {useEffect, useState} from 'react';
import type {ResolvedDestinationTarget} from '../../../product/destinations';
import type {DestinationLocale} from '../../../product/destinations';
import type {CurrentSnapshotViewModel} from '../../../product/hub';
import type {BrowserNightscoutClient} from './browserNightscoutClient';
import {loadBrowserCurrentSnapshot} from './browserNightscoutDataSources';

const DEFAULT_REFRESH_INTERVAL_MS = 60_000;

interface BrowserVisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

/** Refreshes the small current-reading surface without rebuilding the Workspace. */
export const useBrowserCurrentSnapshot = (input: {
  readonly client?: Pick<BrowserNightscoutClient, 'readEntries'> &
    Partial<Pick<BrowserNightscoutClient, 'readDeviceStatuses'>>;
  readonly target: ResolvedDestinationTarget;
  readonly locale: DestinationLocale;
  readonly visibility?: BrowserVisibilitySource;
  readonly refreshIntervalMs?: number;
  readonly now?: () => number;
}): CurrentSnapshotViewModel | undefined => {
  const {
    client,
    locale,
    now,
    refreshIntervalMs,
    target,
    visibility: inputVisibility,
  } = input;
  const [snapshot, setSnapshot] = useState<
    CurrentSnapshotViewModel | undefined
  >(() => (client === undefined ? undefined : {status: 'loading', target}));

  useEffect(() => {
    if (client === undefined) {
      setSnapshot(undefined);
      return undefined;
    }
    let active = true;
    let inFlight = false;
    const visibility = inputVisibility ?? globalThis.document;
    const refresh = async () => {
      if (inFlight || visibility?.visibilityState === 'hidden') {
        return;
      }
      inFlight = true;
      try {
        const next = await loadBrowserCurrentSnapshot({
          client,
          locale,
          target,
          ...(now === undefined ? {} : {nowMs: now()}),
        });
        if (active) {
          setSnapshot(next);
        }
      } finally {
        inFlight = false;
      }
    };
    setSnapshot({status: 'loading', target});
    refresh().catch(() => undefined);
    const interval = setInterval(
      () => refresh().catch(() => undefined),
      refreshIntervalMs ?? DEFAULT_REFRESH_INTERVAL_MS,
    );
    const onVisibilityChange = () => {
      if (visibility?.visibilityState === 'visible') {
        refresh().catch(() => undefined);
      }
    };
    visibility?.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      active = false;
      clearInterval(interval);
      visibility?.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [client, inputVisibility, locale, now, refreshIntervalMs, target]);

  return snapshot;
};
