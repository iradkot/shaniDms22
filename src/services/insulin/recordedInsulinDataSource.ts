import {fetchTreatmentsForDateRangeWithMetadata} from '../../api/apiRequests';
import {getNightscoutConfigurationRevision} from '../../api/shaniNightscoutInstances';
import {getActiveNightscoutCacheScope} from '../nightscoutCacheScope';
import {createRecordedInsulinDataSource} from './createRecordedInsulinDataSource';

// Compatibility exports. Browser code should import the platform-neutral factory directly.
export * from './createRecordedInsulinDataSource';

/** Native account-scoped instance shared by daily summaries and comparisons. */
export const recordedInsulinDataSource = createRecordedInsulinDataSource({
  fetchTreatments: fetchTreatmentsForDateRangeWithMetadata,
  getScopeKey: () =>
    `${
      getActiveNightscoutCacheScope()?.sourceIdentity ?? 'unconfigured'
    }:${getNightscoutConfigurationRevision()}`,
});
