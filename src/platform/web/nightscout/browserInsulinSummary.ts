import {calculateTotalInsulin} from '../../../utils/insulin.utils/calculateTotalInsulin';
import {mapNightscoutTreatmentsToInsulinDataEntries} from '../../../utils/nightscoutTreatments.utils';
import type {
  BrowserNightscoutBasalProfile,
  BrowserNightscoutRange,
  BrowserNightscoutTreatment,
} from './browserNightscoutClient';

/** Deliberately distinct from a recorded-delivery summary. */
export type BrowserModeledInsulinSummary =
  | {readonly quality: 'unavailable'}
  | {
      readonly quality: 'available';
      readonly basalUnits: number;
      readonly bolusUnits: number;
      readonly basalEstimated: true;
    };

/**
 * Compatibility-only profile model; no current product summary uses this.
 * Schedule fills basal gaps. Use createRecordedInsulinDataSource for recorded
 * daily totals, previous-day summaries and comparisons.
 * @deprecated Kept for existing imports. Never present this as recorded insulin.
 */
export const buildBrowserModeledInsulinSummary = (
  startMs: number,
  endMs: number,
  treatments: BrowserNightscoutRange<BrowserNightscoutTreatment> | undefined,
  profile: BrowserNightscoutRange<BrowserNightscoutBasalProfile> | undefined,
): BrowserModeledInsulinSummary => {
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
        basalEstimated: true,
        basalUnits: totals.totalBasal,
        bolusUnits: totals.totalBolus,
      }
    : {quality: 'unavailable'};
};

/** @deprecated Use buildBrowserModeledInsulinSummary; these totals contain scheduled basal. */
export const buildBrowserInsulinSummary = buildBrowserModeledInsulinSummary;
