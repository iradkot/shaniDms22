import {
  getNightscoutConfigurationRevision,
  nightscoutInstance,
} from './shaniNightscoutInstances';

export interface NightscoutRecordsResponse {
  readonly records: Record<string, unknown>[];
  /** Includes invalid rows removed during decoding, so filtering cannot hide truncation. */
  readonly receivedCount: number;
}

const pending = new Map<string, Promise<NightscoutRecordsResponse>>();

/** Shared transport and validation for treatments, device status and profiles.
 * Storage policy belongs to the caller; even uncached readers share in-flight work.
 */
export const requestNightscoutRecordsWithMetadata = async (
  path: string,
): Promise<NightscoutRecordsResponse> => {
  const revision = getNightscoutConfigurationRevision();
  const assertCurrent = () => {
    if (getNightscoutConfigurationRevision() !== revision) {
      throw new Error('Nightscout source changed while loading records.');
    }
  };
  const key = `${revision}:${path}`;
  let request = pending.get(key);
  if (!request) {
    request = (async () => {
      const response = await nightscoutInstance.get<unknown>(path);
      assertCurrent();
      if (!Array.isArray(response.data)) {
        throw new Error('Nightscout returned an invalid record list.');
      }
      return {
        receivedCount: response.data.length,
        records: response.data.filter(
          (value): value is Record<string, unknown> =>
            typeof value === 'object' &&
            value !== null &&
            !Array.isArray(value),
        ),
      };
    })();
    pending.set(key, request);
    request
      .finally(() => {
        if (pending.get(key) === request) {
          pending.delete(key);
        }
      })
      .catch(() => {});
  }
  const result = await request;
  assertCurrent();
  return {
    receivedCount: result.receivedCount,
    records: result.records.map(record => ({...record})),
  };
};

export const requestNightscoutRecords = async (
  path: string,
): Promise<Record<string, unknown>[]> =>
  (await requestNightscoutRecordsWithMetadata(path)).records;
