import type {NightscoutConfigContextValue} from '../../../contexts/NightscoutConfigContext';
import {NightscoutConnectionTestError} from '../../../services/nightscoutConnectionTest';
import type {SettingsNightscoutConnectionRuntime} from '../../../product/settings/runtime';
import type {LatestNightscoutSnapshotState} from '../product/LatestNightscoutSnapshotStateContext';

export const createNativeNightscoutSettingsConnection = ({
  sourceKey,
  profile,
  isLoaded,
  snapshot,
  testProfileConnection,
  recovery,
}: {
  readonly sourceKey: string;
  readonly profile: {readonly id: string; readonly baseUrl: string} | null;
  readonly isLoaded: boolean;
  readonly snapshot: LatestNightscoutSnapshotState;
  readonly testProfileConnection: NightscoutConfigContextValue['testProfileConnection'];
  readonly recovery?: SettingsNightscoutConnectionRuntime['recovery'];
}): SettingsNightscoutConnectionRuntime => {
  const raw = snapshot.snapshot;
  const sample =
    typeof raw === 'object' && raw !== null && 'enrichedBg' in raw
      ? raw.enrichedBg
      : undefined;
  const validSample =
    typeof sample === 'object' &&
    sample !== null &&
    'sgv' in sample &&
    typeof sample.sgv === 'number' &&
    Number.isFinite(sample.sgv) &&
    sample.sgv > 0;
  const date =
    validSample &&
    'date' in sample &&
    typeof sample.date === 'number' &&
    Number.isFinite(sample.date)
      ? sample.date
      : undefined;
  return {
    sourceKey,
    status: !profile
      ? 'not-configured'
      : !isLoaded
      ? 'loading'
      : snapshot.error != null
      ? 'failed'
      : validSample
      ? 'connected'
      : snapshot.isLoading
      ? 'loading'
      : 'configured',
    ...(profile === null || date === undefined ? {} : {latestEntryDate: date}),
    ...(recovery === undefined ? {} : {recovery}),
    async testConnection() {
      if (!profile) {
        return {status: 'failed', reason: 'unknown'};
      }
      try {
        const result = await testProfileConnection({
          profileId: profile.id,
          urlInput: profile.baseUrl,
        });
        return {
          status: 'connected',
          entriesCount: result.entriesCount,
          ...(result.latestEntryDate === undefined
            ? {}
            : {latestEntryDate: result.latestEntryDate}),
        };
      } catch (error) {
        return {
          status: 'failed',
          reason:
            error instanceof NightscoutConnectionTestError
              ? error.code
              : 'unknown',
        };
      }
    },
  };
};
