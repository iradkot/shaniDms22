import {nightscoutInstance} from 'app/api/shaniNightscoutInstances';
import {decodeNightscoutGlucose as decodeBgSample} from './nightscoutGlucose';
import {getFormattedStartEndOfDay} from 'app/utils/datetime.utils';
import {ProfileDataType} from 'app/types/insulin.types';
import {BgSample} from 'app/types/day_bgs.types';
import {bgSortFunction} from 'app/utils/bg.utils';
import {DeviceStatusEntry} from 'app/types/deviceStatus.types';
import {requestNightscoutRecords} from './nightscoutRecords';
import {requestCompleteNightscoutRange} from './nightscoutRangeRecords';
import {
  assertActiveNightscoutCacheScope,
  getActiveNightscoutCacheScope,
} from 'app/services/nightscoutCacheScope';
import {
  readNightscoutRangeCache,
  writeNightscoutRangeCache,
} from 'app/services/nightscoutRangeCache';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_BG_COUNT = 1000;
const MAX_BG_COUNT = 100000;
const EXPECTED_READINGS_PER_DAY = 288; // 5-minute CGM
const HIGH_FREQUENCY_READINGS_PER_DAY = 1440; // 1-minute CGM

export type NightscoutRangeFreshness =
  | {readonly kind: 'fresh'; readonly fetchedAtMs: number}
  | {
      readonly kind: 'stale';
      readonly fetchedAtMs: number;
      readonly reason: 'network-unavailable';
    };

export interface NightscoutRangeResult<T> {
  readonly records: readonly T[];
  readonly freshness: NightscoutRangeFreshness;
}

const objectRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const decodeObjectRecord = (value: unknown): Record<string, unknown> | null =>
  objectRecord(value);

const bgTimestamp = (record: BgSample): number | undefined => record.date;

const nightscoutRecordTimestamp = (
  record: Record<string, unknown>,
): number | undefined => {
  for (const candidate of [record.date, record.mills, record.timestamp]) {
    const parsed =
      typeof candidate === 'number'
        ? candidate
        : typeof candidate === 'string' && candidate.trim().length > 0
        ? Number(candidate)
        : Number.NaN;
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  for (const candidate of [record.created_at, record.dateString]) {
    if (typeof candidate === 'string') {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }
  return undefined;
};

const estimateBgCountForRange = (startDate: Date, endDate: Date) => {
  const days = Math.max(
    1,
    Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1,
  );

  // For longer ranges, it's common to have 1-minute CGM. If we under-estimate,
  // Nightscout will truncate the *earliest* readings which breaks month TIR.
  const expectedPerDay =
    days >= 20 ? HIGH_FREQUENCY_READINGS_PER_DAY : EXPECTED_READINGS_PER_DAY;

  // Add a bit of slack for sensors that report slightly faster / duplicates.
  const estimate = Math.ceil(days * expectedPerDay * 1.1);
  return Math.min(MAX_BG_COUNT, Math.max(DEFAULT_BG_COUNT, estimate));
};

export const fetchBgDataForDateRangeWithMetadata = async (
  startDate: Date,
  endDate: Date,
): Promise<NightscoutRangeResult<BgSample>> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count = estimateBgCountForRange(startDate, endDate);
  const cacheScope = getActiveNightscoutCacheScope();
  const apiUrl: string = `/api/v1/entries?find[dateString][$gte]=${startIso}&find[dateString][$lte]=${endIso}&count=${count}`;
  try {
    const response = await nightscoutInstance.get<BgSample[]>(apiUrl);
    if (cacheScope) {
      assertActiveNightscoutCacheScope(cacheScope);
    }
    const sortedBgData = (Array.isArray(response.data) ? response.data : [])
      .map(decodeBgSample)
      .filter((sample): sample is BgSample => sample !== null)
      .sort(bgSortFunction(false));
    const fetchedAtMs = Date.now();
    if (cacheScope) {
      try {
        await writeNightscoutRangeCache({
          scope: cacheScope,
          resource: 'bg-data.v3',
          startMs: startDate.getTime(),
          endMs: endDate.getTime(),
          fetchedAtMs,
          records: sortedBgData,
          getTimestampMs: bgTimestamp,
        });
      } catch (e) {
        console.warn('fetchBgDataForDateRange: Failed caching BG data', e);
      }
    }
    if (cacheScope) {
      assertActiveNightscoutCacheScope(cacheScope);
    }
    return {
      records: sortedBgData,
      freshness: {kind: 'fresh', fetchedAtMs},
    };
  } catch (error: unknown) {
    if (cacheScope) {
      assertActiveNightscoutCacheScope(cacheScope);
      try {
        const cached = await readNightscoutRangeCache({
          scope: cacheScope,
          resource: 'bg-data.v3',
          startMs: startDate.getTime(),
          endMs: endDate.getTime(),
          decodeRecord: decodeBgSample,
          getTimestampMs: bgTimestamp,
        });
        assertActiveNightscoutCacheScope(cacheScope);
        if (cached) {
          console.warn(
            'fetchBgDataForDateRange: Nightscout unavailable; using stale cache',
          );
          return {
            records: [...cached.records].sort(bgSortFunction(false)),
            freshness: {
              kind: 'stale',
              fetchedAtMs: cached.fetchedAtMs,
              reason: 'network-unavailable',
            },
          };
        }
      } catch (cacheError) {
        console.warn(
          'fetchBgDataForDateRange: Failed reading cache',
          cacheError,
        );
      }
      assertActiveNightscoutCacheScope(cacheScope);
    }
    console.error('Error fetching BG data from Nightscout:', error);
    throw error;
  }
};

export const fetchBgDataForDateRange = async (
  startDate: Date,
  endDate: Date,
): Promise<BgSample[]> => [
  ...(await fetchBgDataForDateRangeWithMetadata(startDate, endDate)).records,
];

/**
 * Fetch BG entries for a range without writing to AsyncStorage.
 *
 * Oracle PRD: the Oracle feature maintains its own stable local cache and
 * performs incremental sync; we avoid polluting the generic date-range cache
 * keys (which would change on every run for rolling windows).
 */
export const fetchBgDataForDateRangeUncached = async (
  startDate: Date,
  endDate: Date,
  options?: {count?: number; throwOnError?: boolean},
): Promise<BgSample[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count =
    typeof options?.count === 'number'
      ? options.count
      : estimateBgCountForRange(startDate, endDate);

  const apiUrl: string = `/api/v1/entries?find[dateString][$gte]=${startIso}&find[dateString][$lte]=${endIso}&count=${count}`;
  try {
    const response = await nightscoutInstance.get<BgSample[]>(apiUrl);
    const bgData: BgSample[] = response.data ?? [];
    return bgData.sort(bgSortFunction(false));
  } catch (error: any) {
    console.warn(
      'fetchBgDataForDateRangeUncached: Failed to fetch BG data',
      error,
    );
    if (options?.throwOnError) {
      throw error;
    }
    return [];
  }
};

const DEFAULT_TREATMENTS_COUNT = 1000;
const MAX_TREATMENTS_COUNT = 50000;
const EXPECTED_TREATMENTS_PER_DAY = 80;

const estimateTreatmentsCountForRange = (startDate: Date, endDate: Date) => {
  const days = Math.max(
    1,
    Math.floor((endDate.getTime() - startDate.getTime()) / MS_PER_DAY) + 1,
  );

  const estimate = Math.ceil(days * EXPECTED_TREATMENTS_PER_DAY * 1.2);
  return Math.min(
    MAX_TREATMENTS_COUNT,
    Math.max(DEFAULT_TREATMENTS_COUNT, estimate),
  );
};

/**
 * Fetch treatments for a range without writing to AsyncStorage.
 *
 * Oracle PRD: the Oracle feature maintains its own stable local cache.
 */
export const fetchTreatmentsForDateRangeUncached = async (
  startDate: Date,
  endDate: Date,
  options?: {count?: number},
): Promise<Record<string, unknown>[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count =
    typeof options?.count === 'number'
      ? options.count
      : estimateTreatmentsCountForRange(startDate, endDate);

  return requestCompleteNightscoutRange(
    limit =>
      `/api/v1/treatments?find[created_at][$gte]=${startIso}&find[created_at][$lte]=${endIso}&count=${limit}`,
    count,
    MAX_TREATMENTS_COUNT,
  );
};

/**
 * Fetch device status entries for a range without writing to AsyncStorage.
 *
 * Rejects unavailable data so callers can distinguish it from a known empty range.
 */
export const fetchDeviceStatusForDateRangeUncached = async (
  startDate: Date,
  endDate: Date,
  options?: {count?: number; throwOnError?: boolean},
): Promise<DeviceStatusEntry[]> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count =
    typeof options?.count === 'number'
      ? options.count
      : estimateBgCountForRange(startDate, endDate);

  return requestCompleteNightscoutRange(
    limit =>
      `/api/v1/devicestatus?find[created_at][$gte]=${startIso}&find[created_at][$lte]=${endIso}&count=${limit}`,
    count,
    MAX_BG_COUNT,
  ) as Promise<DeviceStatusEntry[]>;
};

/**
 * Fetches the most recent BG entry from Nightscout.
 *
 * PRD: uses `/api/v1/entries.json?count=1`.
 * Returns `null` when the request fails or no entries are available.
 */
export const fetchLatestBgEntry = async (): Promise<BgSample | null> => {
  try {
    const response = await nightscoutInstance.get<BgSample[]>(
      '/api/v1/entries.json?count=24',
    );
    const rows = Array.isArray(response.data) ? response.data : [];

    const latestValid = rows
      .filter((item: any) => {
        const sgv =
          typeof item?.sgv === 'number' ? item.sgv : Number(item?.sgv);
        const ts =
          typeof item?.date === 'number' ? item.date : Number(item?.date);
        return Number.isFinite(sgv) && Number.isFinite(ts) && sgv > 0;
      })
      .sort((a: any, b: any) => Number(b?.date ?? 0) - Number(a?.date ?? 0))[0];

    return latestValid ?? null;
  } catch (error: any) {
    console.warn('fetchLatestBgEntry: Failed to fetch latest BG entry', error);
    return null;
  }
};

/**
 * Fetches the most recent device status entry from Nightscout.
 *
 * PRD: uses `/api/v1/devicestatus.json?count=1`.
 * Device status is optional; returns `null` on failure.
 */
export const fetchLatestDeviceStatusEntry =
  async (): Promise<DeviceStatusEntry | null> => {
    try {
      const records = await requestNightscoutRecords(
        '/api/v1/devicestatus.json?count=1',
      );
      return (records[0] as DeviceStatusEntry | undefined) ?? null;
    } catch (error: any) {
      console.warn(
        'fetchLatestDeviceStatusEntry: Failed to fetch latest device status',
        error,
      );
      return null;
    }
  };

export const fetchDeviceStatusForDateRangeWithMetadata = async (
  startDate: Date,
  endDate: Date,
): Promise<NightscoutRangeResult<DeviceStatusEntry>> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();

  // Device status is usually emitted every ~5 minutes.
  const count = estimateBgCountForRange(startDate, endDate);
  const cacheScope = getActiveNightscoutCacheScope();

  try {
    const status = (await requestCompleteNightscoutRange(
      limit =>
        `/api/v1/devicestatus?find[created_at][$gte]=${startIso}&find[created_at][$lte]=${endIso}&count=${limit}`,
      count,
      MAX_BG_COUNT,
    )) as DeviceStatusEntry[];
    if (cacheScope) {
      assertActiveNightscoutCacheScope(cacheScope);
    }
    const fetchedAtMs = Date.now();
    if (cacheScope) {
      try {
        await writeNightscoutRangeCache({
          scope: cacheScope,
          resource: 'device-status.v3',
          startMs: startDate.getTime(),
          endMs: endDate.getTime(),
          fetchedAtMs,
          records: status,
          getTimestampMs: nightscoutRecordTimestamp,
        });
      } catch (e) {
        console.warn(
          'fetchDeviceStatusForDateRange: Failed caching device status',
          e,
        );
      }
    }

    if (cacheScope) {
      assertActiveNightscoutCacheScope(cacheScope);
    }

    return {records: status, freshness: {kind: 'fresh', fetchedAtMs}};
  } catch (error: unknown) {
    if (cacheScope) {
      assertActiveNightscoutCacheScope(cacheScope);
      try {
        const cached = await readNightscoutRangeCache({
          scope: cacheScope,
          resource: 'device-status.v3',
          startMs: startDate.getTime(),
          endMs: endDate.getTime(),
          decodeRecord: value =>
            decodeObjectRecord(value) as DeviceStatusEntry | null,
          getTimestampMs: nightscoutRecordTimestamp,
        });
        assertActiveNightscoutCacheScope(cacheScope);
        if (cached) {
          return {
            records: cached.records,
            freshness: {
              kind: 'stale',
              fetchedAtMs: cached.fetchedAtMs,
              reason: 'network-unavailable',
            },
          };
        }
      } catch (cacheError) {
        console.warn(
          'fetchDeviceStatusForDateRange: Failed reading cache',
          cacheError,
        );
      }
      assertActiveNightscoutCacheScope(cacheScope);
    }
    throw error;
  }
};

/**
 * Network-first treatments read with a bounded offline fallback.
 *
 * This method rejects when neither
 * Nightscout nor a complete cached range is available. Callers can therefore
 * mark a view incomplete instead of presenting an empty treatment list as fact.
 */
export const fetchTreatmentsForDateRangeWithMetadata = async (
  startDate: Date,
  endDate: Date,
): Promise<NightscoutRangeResult<Record<string, unknown>>> => {
  const startIso = startDate.toISOString();
  const endIso = endDate.toISOString();
  const count = estimateTreatmentsCountForRange(startDate, endDate);
  const cacheScope = getActiveNightscoutCacheScope();
  try {
    const records = await requestCompleteNightscoutRange(
      limit =>
        `/api/v1/treatments?find[created_at][$gte]=${startIso}&find[created_at][$lte]=${endIso}&count=${limit}`,
      count,
      MAX_TREATMENTS_COUNT,
    );
    if (cacheScope) {
      assertActiveNightscoutCacheScope(cacheScope);
    }
    const fetchedAtMs = Date.now();
    if (cacheScope) {
      try {
        await writeNightscoutRangeCache({
          scope: cacheScope,
          resource: 'treatments.v2',
          startMs: startDate.getTime(),
          endMs: endDate.getTime(),
          fetchedAtMs,
          records,
          getTimestampMs: nightscoutRecordTimestamp,
        });
      } catch (cacheError) {
        console.warn(
          'fetchTreatmentsForDateRangeWithMetadata: Failed caching treatments',
          cacheError,
        );
      }
    }
    if (cacheScope) {
      assertActiveNightscoutCacheScope(cacheScope);
    }
    return {records, freshness: {kind: 'fresh', fetchedAtMs}};
  } catch (error: unknown) {
    if (cacheScope) {
      assertActiveNightscoutCacheScope(cacheScope);
      try {
        const cached = await readNightscoutRangeCache({
          scope: cacheScope,
          resource: 'treatments.v2',
          startMs: startDate.getTime(),
          endMs: endDate.getTime(),
          decodeRecord: decodeObjectRecord,
          getTimestampMs: nightscoutRecordTimestamp,
        });
        assertActiveNightscoutCacheScope(cacheScope);
        if (cached) {
          return {
            records: cached.records,
            freshness: {
              kind: 'stale',
              fetchedAtMs: cached.fetchedAtMs,
              reason: 'network-unavailable',
            },
          };
        }
      } catch (cacheError) {
        console.warn(
          'fetchTreatmentsForDateRangeWithMetadata: Failed reading cache',
          cacheError,
        );
      }
      assertActiveNightscoutCacheScope(cacheScope);
    }
    throw error;
  }
};

export const fetchDeviceStatusForDateRange = async (
  startDate: Date,
  endDate: Date,
): Promise<DeviceStatusEntry[]> => {
  try {
    return [
      ...(await fetchDeviceStatusForDateRangeWithMetadata(startDate, endDate))
        .records,
    ];
  } catch (error) {
    // Device status may not be enabled; preserve the optional legacy contract.
    console.warn(
      'fetchDeviceStatusForDateRange: Failed to fetch device status',
      error,
    );
    return [];
  }
};

export const fetchBgDataForDate = async (date: Date): Promise<BgSample[]> => {
  const {formattedStartDate, formattedEndDate} =
    getFormattedStartEndOfDay(date);

  const startDate = new Date(formattedStartDate);
  const endDate = new Date(formattedEndDate);

  try {
    return await fetchBgDataForDateRange(startDate, endDate);
  } catch (error: any) {
    console.warn('fetchBgDataForDate: Failed to fetch daily BG data', error);
    return [];
  }
};

export const getUserProfileFromNightscout = async (
  date: string,
): Promise<ProfileDataType> => {
  const asOfMs = Date.parse(date);
  const asOfIso = Number.isFinite(asOfMs)
    ? new Date(asOfMs).toISOString()
    : new Date().toISOString();
  const apiUrl = `/api/v1/profiles?find[startDate][$lte]=${asOfIso}&sort[startDate]=-1&count=1`;
  return (await requestNightscoutRecords(apiUrl)) as unknown as ProfileDataType;
};
