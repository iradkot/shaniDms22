import {loadInsulinContext, type InsulinContext} from './insulinDataSource';
import type {BasalProfile, TimeValueEntry} from 'app/types/insulin.types';
import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';
import {
  buildBasalDeliveryTimeline,
  sumBasalDelivery,
} from 'app/utils/insulin.utils/basalDeliveryTimeline';

/** Profile-based approximation for legacy charts and analysis, not recorded delivery. */
export type ModeledInsulinRangeMetrics = {
  readonly basalEstimated: true;
  totalBasal: number;
  /** Null when the verified total has no temp subtotal on the same basis. */
  totalTempBasal: number | null;
  totalBolus: number;
  totalInsulin: number;
  totalCarbs: number;
};

function hasValidScheduleTime(entry: TimeValueEntry): boolean {
  // The timeline gives seconds-since-midnight precedence when it is present.
  if (entry.timeAsSeconds !== undefined) {
    return (
      Number.isInteger(entry.timeAsSeconds) &&
      entry.timeAsSeconds >= 0 &&
      entry.timeAsSeconds < 86_400
    );
  }
  return (
    typeof entry.time === 'string' &&
    /^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(entry.time)
  );
}

/** Validates a schedule for modeling; a valid schedule does not prove delivery. */
export function hasUsableModeledBasalProfile(profile: BasalProfile): boolean {
  return (
    profile.length > 0 &&
    profile.every(
      entry =>
        entry !== null &&
        typeof entry === 'object' &&
        Number.isFinite(entry.value) &&
        entry.value >= 0 &&
        hasValidScheduleTime(entry),
    )
  );
}

/** Fresh, valid inputs are required even for profile-based estimates. */
export function hasUsableModeledInsulinContext(
  context: InsulinContext,
): boolean {
  return (
    context.availability.treatments === 'available' &&
    context.availability.profile === 'available' &&
    (context.recordedInsulin === undefined ||
      (context.recordedInsulin.quality !== 'unavailable' &&
        context.recordedInsulin.bolusUnits !== undefined)) &&
    hasUsableModeledBasalProfile(context.basalProfileData)
  );
}

/**
 * Integrates the active profile and programmed temp-basal events. Missing basal
 * intervals use the profile; do not display these values as recorded delivery.
 * Use buildRecordedInsulinSummary / recordedInsulinDataSource for daily totals.
 */
export function calculateModeledInsulinContextMetrics(
  context: InsulinContext,
  start: Date,
  end: Date,
): ModeledInsulinRangeMetrics {
  if (!hasUsableModeledInsulinContext(context)) {
    throw new Error(
      'Modeled insulin totals require current, valid treatment and basal-profile data.',
    );
  }
  const legacyTotals = calculateTotalInsulin(
    context.insulinData,
    context.basalProfileData,
    start,
    end,
  );
  const period = context.recordedInsulinPeriod;
  const summary = context.recordedInsulin;
  let {totalBasal, totalBolus} = legacyTotals;
  if (period) {
    if (period.startMs !== start.getTime() || period.endMs !== end.getTime()) {
      throw new Error(
        'Insulin totals require the same observed cutoff as their source summary.',
      );
    }
    const usableSummary =
      summary && summary.quality !== 'unavailable' ? summary : undefined;
    const completeRecorded =
      usableSummary?.quality === 'available' &&
      usableSummary.basalCoveragePercent === 100;
    const basal = completeRecorded
      ? usableSummary.basalUnits
      : usableSummary?.estimatedBasalUnits;
    const bolus = usableSummary?.bolusUnits;
    if (
      basal === undefined ||
      bolus === undefined ||
      !Number.isFinite(basal + bolus) ||
      basal < 0 ||
      bolus < 0
    ) {
      throw new Error(
        'Insulin totals require a complete recorded total or a verified basal estimate.',
      );
    }
    const statedTotal = completeRecorded
      ? basal + bolus
      : usableSummary?.estimatedTotalUnits;
    if (
      statedTotal === undefined ||
      !Number.isFinite(statedTotal) ||
      Math.abs(statedTotal - basal - bolus) > 1e-6
    ) {
      throw new Error('Insulin total does not match its verified components.');
    }
    totalBasal = basal;
    totalBolus = bolus;
  }
  const timeline = buildBasalDeliveryTimeline({
    insulinData: context.insulinData,
    basalProfile: context.basalProfileData,
    startDate: start,
    endDate: end,
  });
  const totalTempBasal = period
    ? null
    : sumBasalDelivery(
        timeline.filter(segment => segment.source === 'tempBasal'),
      );
  const totalCarbs = context.carbTreatments.reduce(
    (sum, item) => sum + item.carbs,
    0,
  );
  return {
    basalEstimated: true,
    totalBasal,
    totalTempBasal,
    totalBolus,
    totalInsulin: totalBasal + totalBolus,
    totalCarbs,
  };
}

export async function getModeledInsulinRangeMetrics(
  start: Date,
  end: Date,
): Promise<ModeledInsulinRangeMetrics> {
  const context = await loadInsulinContext({
    startMs: start.getTime(),
    endMs: end.getTime(),
  });
  return calculateModeledInsulinContextMetrics(context, start, end);
}

/** @deprecated Use ModeledInsulinRangeMetrics; these values include scheduled basal. */
export type InsulinRangeMetrics = ModeledInsulinRangeMetrics;
/** @deprecated Use hasUsableModeledBasalProfile; a profile cannot prove delivery. */
export const hasAuthoritativeBasalProfile = hasUsableModeledBasalProfile;
/** @deprecated Use hasUsableModeledInsulinContext; this checks modeled inputs only. */
export const hasAuthoritativeInsulinTotalsContext =
  hasUsableModeledInsulinContext;
/** @deprecated Use calculateModeledInsulinContextMetrics for explicit estimate semantics. */
export const calculateInsulinContextMetrics =
  calculateModeledInsulinContextMetrics;
/** @deprecated Use getModeledInsulinRangeMetrics for explicit estimate semantics. */
export const getInsulinRangeMetrics = getModeledInsulinRangeMetrics;
