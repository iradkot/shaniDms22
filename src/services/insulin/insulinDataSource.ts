import {
  fetchDeviceStatusForDateRangeWithMetadata,
  fetchTreatmentsForDateRangeWithMetadata,
  getUserProfileFromNightscout,
  type NightscoutRangeFreshness,
  type NightscoutRangeResult,
} from '../../api/apiRequests';
import {getNightscoutConfigurationRevision} from '../../api/shaniNightscoutInstances';
import type {DeviceStatusEntry} from '../../types/deviceStatus.types';
import type {FoodItemDTO} from '../../types/food.types';
import type {
  BasalProfile,
  InsulinDataEntry,
  ProfileDataType,
} from '../../types/insulin.types';
import {
  decodeNightscoutLoadSample,
  type NightscoutLoadSample,
} from '../../utils/mergeDeviceStatusIntoBgSamples.utils';
import {
  extractBasalProfileFromNightscoutProfileData,
  filterFoodItemsToRange,
  filterInsulinDataToRange,
  mapNightscoutTreatmentsToCarbFoodItems,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from '../../utils/nightscoutTreatments.utils';
import {getActiveNightscoutCacheScope} from '../nightscoutCacheScope';

export type InsulinDataAvailability = 'available' | 'stale' | 'unavailable';
export interface InsulinContextRequest {
  readonly startMs: number;
  /** Exclusive end, shared by every caller. */
  readonly endMs: number;
  readonly profileAsOfMs?: number;
  readonly forceRefresh?: boolean;
}
export type InsulinLoadSample = NightscoutLoadSample;
export interface InsulinContext {
  /** Treatment events in the requested range. Basal carry-in is in insulinData. */
  readonly treatments: readonly Record<string, unknown>[];
  readonly deviceStatus: readonly DeviceStatusEntry[];
  readonly profileData: ProfileDataType | null;
  readonly insulinData: InsulinDataEntry[];
  readonly basalProfileData: BasalProfile;
  readonly carbTreatments: FoodItemDTO[];
  readonly loadSamples: readonly InsulinLoadSample[];
  readonly availability: {
    readonly treatments: InsulinDataAvailability;
    readonly deviceStatus: InsulinDataAvailability;
    readonly profile: InsulinDataAvailability;
  };
  readonly freshness: NightscoutRangeFreshness;
}
export type InsulinContextLoader = (
  request: InsulinContextRequest,
) => Promise<InsulinContext>;

export interface InsulinContextDependencies {
  readonly fetchTreatments: (
    start: Date,
    end: Date,
  ) => Promise<NightscoutRangeResult<Record<string, unknown>>>;
  readonly fetchDeviceStatus: (
    start: Date,
    end: Date,
  ) => Promise<NightscoutRangeResult<DeviceStatusEntry>>;
  readonly fetchProfile: (asOfIso: string) => Promise<ProfileDataType>;
  readonly extractBasalProfile?: (payload: ProfileDataType) => BasalProfile;
  /** Opaque account/source identity including a credential/session revision. */
  readonly getScopeKey: () => string;
  readonly now?: () => number;
}

const DAY_MS = 24 * 60 * 60_000;
const CACHE_TTL_MS = 60_000;
const CACHE_LIMIT = 12;
const treatmentTime = (record: Record<string, unknown>): number => {
  for (const value of [record.created_at, record.timestamp]) {
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
      return Date.parse(value);
    }
  }
  return typeof record.date === 'number' ? record.date : Number.NaN;
};

const copyContext = (context: InsulinContext): InsulinContext => ({
  ...context,
  treatments: context.treatments.map(item => ({...item})),
  deviceStatus: [...context.deviceStatus],
  insulinData: context.insulinData.map(item => ({...item})),
  basalProfileData: context.basalProfileData.map(item => ({...item})),
  carbTreatments: context.carbTreatments.map(item => ({...item})),
  loadSamples: context.loadSamples.map(item => ({...item})),
});

/** One loading/decoding contract for React, product adapters and AI tools. */
export const createInsulinContextLoader = (
  dependencies: InsulinContextDependencies,
): InsulinContextLoader => {
  const now = dependencies.now ?? Date.now;
  const pending = new Map<string, Promise<InsulinContext>>();
  const completed = new Map<
    string,
    {expiresAt: number; value: InsulinContext}
  >();
  let lastScope: string | undefined;

  return async request => {
    const {startMs, endMs} = request;
    const asOfMs = request.profileAsOfMs ?? startMs;
    if (
      ![startMs, endMs, asOfMs].every(value =>
        Number.isFinite(new Date(value).getTime()),
      ) ||
      endMs <= startMs
    ) {
      throw new Error('A valid insulin data time range is required.');
    }
    const scope = dependencies.getScopeKey();
    if (scope !== lastScope) {
      completed.clear();
      pending.clear();
      lastScope = scope;
    }
    const key = `${scope}:${startMs}:${endMs}:${asOfMs}`;
    const assertCurrent = () => {
      if (dependencies.getScopeKey() !== scope) {
        throw new Error(
          'Nightscout source changed while loading insulin data.',
        );
      }
    };
    const cached = completed.get(key);
    if (!request.forceRefresh && cached && cached.expiresAt > now()) {
      return copyContext(cached.value);
    }
    let work = pending.get(key);
    if (!work) {
      work = (async (): Promise<InsulinContext> => {
        // The carry-in window is shared: callers must not fetch their own basal lookback.
        const [treatmentsResult, statusesResult, profileResult] =
          await Promise.allSettled([
            dependencies.fetchTreatments(
              new Date(startMs - DAY_MS),
              new Date(endMs - 1),
            ),
            dependencies.fetchDeviceStatus(
              new Date(startMs),
              new Date(endMs - 1),
            ),
            dependencies.fetchProfile(new Date(asOfMs).toISOString()),
          ]);
        assertCurrent();
        const treatments =
          treatmentsResult.status === 'fulfilled'
            ? treatmentsResult.value.records
            : [];
        const deviceStatus =
          statusesResult.status === 'fulfilled'
            ? statusesResult.value.records
            : [];
        const profileData =
          profileResult.status === 'fulfilled' ? profileResult.value : null;
        let basalProfileData: BasalProfile = [];
        let profileAvailable = profileData !== null;
        if (profileData !== null) {
          try {
            basalProfileData = (
              dependencies.extractBasalProfile ??
              extractBasalProfileFromNightscoutProfileData
            )(profileData);
          } catch {
            profileAvailable = false;
          }
        }
        const resourceAvailability = <T>(
          result: PromiseSettledResult<NightscoutRangeResult<T>>,
        ): InsulinDataAvailability =>
          result.status === 'rejected'
            ? 'unavailable'
            : result.value.freshness.kind === 'stale'
            ? 'stale'
            : 'available';
        const availability = {
          treatments: resourceAvailability(treatmentsResult),
          deviceStatus: resourceAvailability(statusesResult),
          profile: profileAvailable
            ? ('available' as const)
            : ('unavailable' as const),
        };
        const freshnessRecords = [treatmentsResult, statusesResult].flatMap(
          result =>
            result.status === 'fulfilled'
              ? [result.value.freshness.fetchedAtMs]
              : [],
        );
        const fetchedAtMs =
          freshnessRecords.length > 0 ? Math.min(...freshnessRecords) : now();
        const loadSamples: InsulinLoadSample[] = deviceStatus
          .flatMap(entry => {
            const sample = decodeNightscoutLoadSample(entry);
            if (
              sample === undefined ||
              sample.timestampMs < startMs ||
              sample.timestampMs >= endMs
            ) {
              return [];
            }
            return [sample];
          })
          .sort((left, right) => left.timestampMs - right.timestampMs);
        const context: InsulinContext = {
          treatments: treatments.filter(
            item =>
              treatmentTime(item) >= startMs && treatmentTime(item) < endMs,
          ),
          deviceStatus,
          profileData,
          insulinData: filterInsulinDataToRange(
            mapNightscoutTreatmentsToInsulinDataEntries([...treatments]),
            startMs,
            endMs - 1,
          ),
          basalProfileData,
          carbTreatments: filterFoodItemsToRange(
            mapNightscoutTreatmentsToCarbFoodItems([...treatments]),
            startMs,
            endMs - 1,
          ),
          loadSamples,
          availability,
          freshness: Object.values(availability).every(
            status => status === 'available',
          )
            ? {kind: 'fresh', fetchedAtMs}
            : {kind: 'stale', fetchedAtMs, reason: 'network-unavailable'},
        };
        assertCurrent();
        completed.set(key, {expiresAt: now() + CACHE_TTL_MS, value: context});
        while (completed.size > CACHE_LIMIT) {
          completed.delete(completed.keys().next().value!);
        }
        return context;
      })();
      pending.set(key, work);
      void work
        .finally(() => {
          if (pending.get(key) === work) {
            pending.delete(key);
          }
        })
        .catch(() => {});
    }
    const result = await work;
    assertCurrent();
    return copyContext(result);
  };
};

export const loadInsulinContext: InsulinContextLoader =
  createInsulinContextLoader({
    fetchTreatments: fetchTreatmentsForDateRangeWithMetadata,
    fetchDeviceStatus: fetchDeviceStatusForDateRangeWithMetadata,
    fetchProfile: getUserProfileFromNightscout,
    getScopeKey: () =>
      `${
        getActiveNightscoutCacheScope()?.sourceIdentity ?? 'unconfigured'
      }:${getNightscoutConfigurationRevision()}`,
  });
