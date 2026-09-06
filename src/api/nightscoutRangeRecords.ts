import {requestNightscoutRecordsWithMetadata} from './nightscoutRecords';
import {getNightscoutConfigurationRevision} from './shaniNightscoutInstances';

export const MAX_NIGHTSCOUT_RANGE_COUNT = 100_000;

export class NightscoutIncompleteRangeError extends Error {
  readonly code = 'incomplete-range';

  constructor() {
    super('Nightscout returned an incomplete record range.');
    this.name = 'NightscoutIncompleteRangeError';
  }
}

/**
 * V1 applies count but does not implement skip. Refetch the identical bounded
 * range with a larger count until an unsaturated response proves completeness.
 * Only the final complete list is returned; callers must never cache a prefix.
 * Server contract: nightscout/cgm-remote-monitor lib/server/treatments.js list().
 */
export async function requestCompleteNightscoutRange(
  buildUrl: (count: number) => string,
  initialCount: number,
  maxCount = MAX_NIGHTSCOUT_RANGE_COUNT,
): Promise<Record<string, unknown>[]> {
  if (
    !Number.isSafeInteger(initialCount) ||
    initialCount <= 0 ||
    !Number.isSafeInteger(maxCount) ||
    maxCount <= 0 ||
    maxCount > MAX_NIGHTSCOUT_RANGE_COUNT
  ) {
    throw new Error(
      'Nightscout range limits must be positive integers within the safety limit.',
    );
  }
  const revision = getNightscoutConfigurationRevision();
  const assertCurrent = () => {
    if (getNightscoutConfigurationRevision() !== revision) {
      throw new Error(
        'Nightscout source changed while loading a record range.',
      );
    }
  };
  let count = Math.min(initialCount, maxCount);
  for (;;) {
    const path = buildUrl(count);
    assertCurrent();
    const response = await requestNightscoutRecordsWithMetadata(path);
    assertCurrent();
    if (response.receivedCount < count) {
      return response.records;
    }
    if (count >= maxCount) {
      throw new NightscoutIncompleteRangeError();
    }
    count = Math.min(count * 2, maxCount);
  }
}
