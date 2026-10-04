import {
  fetchTreatmentsForDateRangeWithMetadata,
  getUserProfileFromNightscout,
} from '../../api/apiRequests';
import {getNightscoutConfigurationRevision} from '../../api/shaniNightscoutInstances';
import {getActiveNightscoutCacheScope} from '../nightscoutCacheScope';
import {createRecordedInsulinDataSource} from './createRecordedInsulinDataSource';
import {decodeEstimatedBasalProfile} from './estimatedBasalProfile';

// Compatibility exports. Browser code should import the platform-neutral factory directly.
export * from './createRecordedInsulinDataSource';

/** Native account-scoped instance shared by daily summaries and comparisons. */
export const recordedInsulinDataSource = createRecordedInsulinDataSource({
  fetchTreatments: fetchTreatmentsForDateRangeWithMetadata,
  fetchBasalProfile: async (asOf, through) => {
    const profile = decodeEstimatedBasalProfile(
      await getUserProfileFromNightscout(through.toISOString()),
      asOf.getTime(),
    );
    return {
      ...(profile ? {profile} : {}),
      freshness: {kind: 'fresh', fetchedAtMs: Date.now()},
    };
  },
  getScopeKey: () =>
    `${
      getActiveNightscoutCacheScope()?.sourceIdentity ?? 'unconfigured'
    }:${getNightscoutConfigurationRevision()}`,
});
