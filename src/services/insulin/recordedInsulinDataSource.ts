import {
  fetchTreatmentsForDateRangeWithMetadata,
  getBasalProfileHistoryFromNightscout,
} from '../../api/apiRequests';
import {getNightscoutConfigurationRevision} from '../../api/shaniNightscoutInstances';
import {getActiveNightscoutCacheScope} from '../nightscoutCacheScope';
import {
  createRecordedInsulinDataSource,
  type RecordedBasalProfileRange,
} from './createRecordedInsulinDataSource';
import {decodeEstimatedBasalProfileHistory} from './estimatedBasalProfile';

// Compatibility exports. Browser code should import the platform-neutral factory directly.
export * from './createRecordedInsulinDataSource';

export const fetchEstimatedBasalProfileRange = async (
  asOf: Date,
  through: Date,
): Promise<RecordedBasalProfileRange> => {
  const profile = decodeEstimatedBasalProfileHistory(
    await getBasalProfileHistoryFromNightscout(asOf, through),
    asOf.getTime(),
    through.getTime(),
  );
  return {
    ...(profile ? {profile} : {}),
    freshness: {kind: 'fresh', fetchedAtMs: Date.now()},
  };
};

/** Native account-scoped instance shared by daily summaries and comparisons. */
export const recordedInsulinDataSource = createRecordedInsulinDataSource({
  fetchTreatments: fetchTreatmentsForDateRangeWithMetadata,
  fetchBasalProfile: fetchEstimatedBasalProfileRange,
  getScopeKey: () =>
    `${
      getActiveNightscoutCacheScope()?.sourceIdentity ?? 'unconfigured'
    }:${getNightscoutConfigurationRevision()}`,
});
