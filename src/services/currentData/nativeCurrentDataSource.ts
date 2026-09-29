import {requestNightscoutRecords} from '../../api/nightscoutRecords';
import {getNightscoutConfigurationRevision} from '../../api/shaniNightscoutInstances';
import {
  createCurrentDataSource,
  type CurrentReadResult,
} from '../../modules/currentData';
import {getActiveNightscoutCacheScope} from '../nightscoutCacheScope';

const latest = async (path: string): Promise<CurrentReadResult> => ({
  records: await requestNightscoutRecords(path),
  freshness: {kind: 'fresh', fetchedAtMs: Date.now()},
});

/** One source for the native current header and AI; transports share in-flight requests. */
export const nativeCurrentDataSource = createCurrentDataSource({
  readGlucose: () => latest('/api/v1/entries.json?count=24'),
  readDeviceStatus: () => latest('/api/v1/devicestatus.json?count=12'),
  getScopeKey: () =>
    `${
      getActiveNightscoutCacheScope()?.sourceIdentity ?? 'unconfigured'
    }:${getNightscoutConfigurationRevision()}`,
});
