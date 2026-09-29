import {
  fetchBgDataForDateRangeWithMetadata,
  type NightscoutRangeResult,
} from '../../../api/apiRequests';
import type {
  TrendsDataSource,
  TrendsGlucoseSnapshot,
  TrendsPeriod,
} from '../../../modules/trends';
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
  readonly fetchRangeWithMetadata?: (
    start: Date,
    end: Date,
  ) => Promise<NightscoutRangeResult<NightscoutGlucoseRecord>>;
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
  const fetchRangeWithMetadata =
    dependencies.fetchRangeWithMetadata ??
    (dependencies.fetchRange ? undefined : fetchBgDataForDateRangeWithMetadata);
  const fixtureRange = dependencies.fixtureRange ?? makeE2EBgSamplesForRange;
  const useE2EFixtures = dependencies.useE2EFixtures ?? isE2E;

  const loadGlucoseSnapshot = async (
    period: TrendsPeriod,
  ): Promise<TrendsGlucoseSnapshot> => {
    const start = new Date(period.startMs);
    const end = new Date(period.endMs);
    const result =
      !useE2EFixtures && fetchRangeWithMetadata
        ? await fetchRangeWithMetadata(start, end)
        : undefined;
    const records =
      result?.records ??
      (useE2EFixtures
        ? fixtureRange(start, end)
        : await dependencies.fetchRange!(start, end));
    return {
      samples: records.map(record => ({
        timestampMs: record.date,
        valueMgDl: record.sgv,
      })),
      freshness: result
        ? {
            kind: result.freshness.kind,
            fetchedAtMs: result.freshness.fetchedAtMs,
          }
        : {kind: 'unknown'},
    };
  };
  return {
    loadGlucoseSnapshot,
    async loadGlucoseSamples(period) {
      return (await loadGlucoseSnapshot(period)).samples;
    },
  };
};
