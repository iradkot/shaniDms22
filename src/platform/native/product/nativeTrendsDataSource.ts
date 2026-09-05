import {fetchBgDataForDateRange} from '../../../api/apiRequests';
import type {TrendsDataSource} from '../../../modules/trends';
import {isE2E} from '../../../utils/e2e';
import {makeE2EBgSamplesForRange} from '../../../utils/e2eFixtures';

interface NightscoutGlucoseRecord {
  readonly date: number;
  readonly sgv: number;
}

export interface NativeTrendsDataSourceDependencies {
  /** Opaque identity used by hosts to recreate adapters after a source switch. */
  readonly sourceRevision?: string;
  readonly fetchRange?: (
    start: Date,
    end: Date,
  ) => Promise<readonly NightscoutGlucoseRecord[]>;
  readonly fixtureRange?: (
    start: Date,
    end: Date,
  ) => readonly NightscoutGlucoseRecord[];
  readonly useE2EFixtures?: boolean;
}

/** Native read adapter. Trends owns calculations, while Nightscout stays read-only. */
export const createNativeTrendsDataSource = (
  dependencies: NativeTrendsDataSourceDependencies = {},
): TrendsDataSource => {
  const fetchRange = dependencies.fetchRange ?? fetchBgDataForDateRange;
  const fixtureRange =
    dependencies.fixtureRange ?? makeE2EBgSamplesForRange;
  const useE2EFixtures = dependencies.useE2EFixtures ?? isE2E;

  return {
    async loadGlucoseSamples(period) {
      const start = new Date(period.startMs);
      const end = new Date(period.endMs);
      const records = useE2EFixtures
        ? fixtureRange(start, end)
        : await fetchRange(start, end);
      return records.map(record => ({
        timestampMs: record.date,
        valueMgDl: record.sgv,
      }));
    },
  };
};
