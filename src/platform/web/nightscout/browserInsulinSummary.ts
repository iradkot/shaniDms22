import type {DailyInsulinSourceSummary} from '../../../modules/dailyOverview';
import {calculateTotalInsulin} from '../../../utils/insulin.utils/calculateTotalInsulin';
import {mapNightscoutTreatmentsToInsulinDataEntries} from '../../../utils/nightscoutTreatments.utils';
import type {
  BrowserNightscoutBasalProfile,
  BrowserNightscoutRange,
  BrowserNightscoutTreatment,
} from './browserNightscoutClient';

/** Shares the native delivery calculation; missing evidence stays unknown. */
export const buildBrowserInsulinSummary = (
  startMs: number,
  endMs: number,
  treatments: BrowserNightscoutRange<BrowserNightscoutTreatment> | undefined,
  profile: BrowserNightscoutRange<BrowserNightscoutBasalProfile> | undefined,
): DailyInsulinSourceSummary => {
  const entries = profile?.records[0]?.entries;
  if (
    !treatments ||
    treatments.freshness.kind !== 'fresh' ||
    profile?.freshness.kind !== 'fresh' ||
    !entries?.length ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return {quality: 'unavailable'};
  }
  const totals = calculateTotalInsulin(
    mapNightscoutTreatmentsToInsulinDataEntries([...treatments.records]),
    entries.map(entry => ({
      time: `${String(Math.floor(entry.secondsFromMidnight / 3600)).padStart(
        2,
        '0',
      )}:${String(Math.floor((entry.secondsFromMidnight % 3600) / 60)).padStart(
        2,
        '0',
      )}`,
      timeAsSeconds: entry.secondsFromMidnight,
      value: entry.rateUnitsPerHour,
    })),
    new Date(startMs),
    new Date(endMs),
  );
  return Number.isFinite(totals.totalBasal) &&
    totals.totalBasal >= 0 &&
    Number.isFinite(totals.totalBolus) &&
    totals.totalBolus >= 0
    ? {
        quality: 'available',
        basalUnits: totals.totalBasal,
        bolusUnits: totals.totalBolus,
      }
    : {quality: 'unavailable'};
};
