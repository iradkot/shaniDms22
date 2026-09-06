import {loadInsulinContext, type InsulinContext} from './insulinDataSource';
import type {BasalProfile, TimeValueEntry} from 'app/types/insulin.types';
import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';
import {
  buildBasalDeliveryTimeline,
  sumBasalDelivery,
} from 'app/utils/insulin.utils/basalDeliveryTimeline';

export type InsulinRangeMetrics = {
  totalBasal: number;
  totalTempBasal: number;
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

/** An incomplete or malformed schedule cannot establish a delivery total. */
export function hasAuthoritativeBasalProfile(profile: BasalProfile): boolean {
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

/** Charts may show labelled stale evidence; current numeric totals require fresh inputs. */
export function hasAuthoritativeInsulinTotalsContext(
  context: InsulinContext,
): boolean {
  return (
    context.availability.treatments === 'available' &&
    context.availability.profile === 'available' &&
    hasAuthoritativeBasalProfile(context.basalProfileData)
  );
}

export function calculateInsulinContextMetrics(
  context: InsulinContext,
  start: Date,
  end: Date,
): InsulinRangeMetrics {
  if (!hasAuthoritativeInsulinTotalsContext(context)) {
    throw new Error(
      'Insulin totals are unavailable because current, valid treatment and basal-profile data is required.',
    );
  }
  const {totalBasal, totalBolus} = calculateTotalInsulin(
    context.insulinData,
    context.basalProfileData,
    start,
    end,
  );
  const timeline = buildBasalDeliveryTimeline({
    insulinData: context.insulinData,
    basalProfile: context.basalProfileData,
    startDate: start,
    endDate: end,
  });
  const totalTempBasal = sumBasalDelivery(
    timeline.filter(segment => segment.source === 'tempBasal'),
  );
  const totalCarbs = context.carbTreatments.reduce(
    (sum, item) => sum + item.carbs,
    0,
  );
  return {
    totalBasal,
    totalTempBasal,
    totalBolus,
    totalInsulin: totalBasal + totalBolus,
    totalCarbs,
  };
}

export async function getInsulinRangeMetrics(
  start: Date,
  end: Date,
): Promise<InsulinRangeMetrics> {
  const context = await loadInsulinContext({
    startMs: start.getTime(),
    endMs: end.getTime(),
  });
  return calculateInsulinContextMetrics(context, start, end);
}
