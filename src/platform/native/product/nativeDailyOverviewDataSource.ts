import {getUserProfileFromNightscout} from '../../../api/apiRequests';
import {
  loadInsulinContext as loadSharedInsulinContext,
  type InsulinContextLoader,
} from '../../../services/insulin/insulinDataSource';
import {
  hasAuthoritativeBasalProfile,
  hasAuthoritativeInsulinTotalsContext,
} from '../../../services/insulin/insulinRangeMetrics';
import type {
  DailyInsulinSourceSummary,
  DailyOverviewDataSource,
} from '../../../modules/dailyOverview';
import type {TrendsDataSource} from '../../../modules/trends';
import type {
  BasalProfile,
  InsulinDataEntry,
} from '../../../types/insulin.types';
import {calculateTotalInsulin} from '../../../utils/insulin.utils/calculateTotalInsulin';
import {isE2E} from '../../../utils/e2e';
import {extractBasalProfileFromNightscoutProfileData} from '../../../utils/nightscoutTreatments.utils';
import {createNativeTrendsDataSource} from './nativeTrendsDataSource';

interface InsulinTotals {
  readonly totalBasal: number;
  readonly totalBolus: number;
}

export interface NativeDailyInsulinSummaryDependencies {
  readonly loadInsulinContext?: InsulinContextLoader;
  /** Opaque identity used by hosts to replace loaders after a source switch. */
  readonly sourceRevision?: string;
  readonly fetchInsulinEntries?: (
    start: Date,
    end: Date,
  ) => Promise<readonly InsulinDataEntry[]>;
  readonly fetchProfile?: (asOfIso: string) => Promise<unknown>;
  readonly extractBasalProfile?: (profilePayload: unknown) => BasalProfile;
  readonly calculateTotals?: (
    insulinEntries: readonly InsulinDataEntry[],
    basalProfile: BasalProfile,
    start: Date,
    end: Date,
  ) => InsulinTotals;
  readonly useE2EFixtures?: boolean;
}

export type NativeDailyInsulinSummaryLoader = (
  start: Date,
  end: Date,
) => Promise<DailyInsulinSourceSummary>;

export interface NativeDailyOverviewDataSourceDependencies
  extends NativeDailyInsulinSummaryDependencies {
  readonly glucoseDataSource?: TrendsDataSource;
  readonly loadInsulinSummary?: NativeDailyInsulinSummaryLoader;
}

const isAuthoritativeTotal = (value: number): boolean =>
  Number.isFinite(value) && value >= 0;

export const createNativeDailyInsulinSummaryLoader = (
  dependencies: NativeDailyInsulinSummaryDependencies = {},
): NativeDailyInsulinSummaryLoader => {
  const loadInsulinContext =
    dependencies.loadInsulinContext ?? loadSharedInsulinContext;
  const fetchProfile =
    dependencies.fetchProfile ??
    ((asOfIso: string) => getUserProfileFromNightscout(asOfIso));
  const extractBasalProfile =
    dependencies.extractBasalProfile ??
    ((payload: unknown) =>
      extractBasalProfileFromNightscoutProfileData(payload as any[]));
  const calculateTotals =
    dependencies.calculateTotals ??
    ((insulinEntries, basalProfile, start, end) =>
      calculateTotalInsulin([...insulinEntries], basalProfile, start, end));
  const useE2EFixtures = dependencies.useE2EFixtures ?? isE2E;

  return async (start: Date, end: Date): Promise<DailyInsulinSourceSummary> => {
    if (useE2EFixtures) {
      return {quality: 'unavailable'};
    }
    try {
      let insulinEntries: readonly InsulinDataEntry[];
      let basalProfile: BasalProfile;
      if (
        dependencies.fetchInsulinEntries &&
        !dependencies.loadInsulinContext
      ) {
        // Preserve the existing normalized-entry injection seam. Production
        // never calls a second insulin transport or parses a second payload.
        const [entries, profilePayload] = await Promise.all([
          dependencies.fetchInsulinEntries(start, end),
          fetchProfile(start.toISOString()),
        ]);
        insulinEntries = entries;
        basalProfile = extractBasalProfile(profilePayload);
      } else {
        const context = await loadInsulinContext({
          startMs: start.getTime(),
          endMs: end.getTime(),
        });
        if (!hasAuthoritativeInsulinTotalsContext(context)) {
          return {quality: 'unavailable'};
        }
        insulinEntries = context.insulinData;
        basalProfile = context.basalProfileData;
      }
      if (!hasAuthoritativeBasalProfile(basalProfile)) {
        return {quality: 'unavailable'};
      }
      const totals = calculateTotals(insulinEntries, basalProfile, start, end);
      if (
        !isAuthoritativeTotal(totals.totalBasal) ||
        !isAuthoritativeTotal(totals.totalBolus)
      ) {
        return {quality: 'unavailable'};
      }
      return {
        quality: 'available',
        basalUnits: totals.totalBasal,
        bolusUnits: totals.totalBolus,
      };
    } catch {
      return {quality: 'unavailable'};
    }
  };
};

/**
 * Native read adapter for one daily snapshot.
 *
 * Glucose remains usable when optional insulin/profile data fails. Insulin is
 * shown only when both delivery inputs are authoritative; absence is never
 * converted into a misleading zero.
 */
export const createNativeDailyOverviewDataSource = (
  dependencies: NativeDailyOverviewDataSourceDependencies = {},
): DailyOverviewDataSource => {
  const glucoseDataSource =
    dependencies.glucoseDataSource ?? createNativeTrendsDataSource();
  const loadInsulinSummary =
    dependencies.loadInsulinSummary ??
    createNativeDailyInsulinSummaryLoader(dependencies);

  return {
    async loadDailyOverview(period) {
      const start = new Date(period.startMs);
      const end = new Date(period.endMs);
      const [glucoseSamples, insulinSummary] = await Promise.all([
        glucoseDataSource.loadGlucoseSamples(period),
        loadInsulinSummary(start, end),
      ]);
      return {glucoseSamples, insulinSummary};
    },
  };
};
