import {BasalProfile} from 'app/types/insulin.types';
import {
  buildBasalDeliveryTimeline,
  sumBasalDelivery,
} from './basalDeliveryTimeline';

/**
 * Calculates the total scheduled basal insulin over a date range.
 * Forces minutes/seconds to 0 on startDate and endDate, then
 * iterates day by day, clamping each day's calculation to [startDate, endDate].
 *
 * @param basalProfile - Basal profile data array.
 * @param startDate    - Start date of the period.
 * @param endDate      - End date of the period.
 * @returns Total scheduled basal insulin delivered over the period (units).
 */
export const calculateScheduledBasalInsulin = (
  basalProfile: BasalProfile,
  startDate: Date,
  endDate: Date,
): number => {
  return sumBasalDelivery(
    buildBasalDeliveryTimeline({
      basalProfile,
      startDate,
      endDate,
    }),
  );
};
