import { InsulinDataEntry, BasalProfile } from 'app/types/insulin.types';
import { calculateScheduledBasalInsulin } from './calculateScheduledBasalInsulin';

/**
 * Calculates total basal and bolus insulin over a date range.
 * @param insulinData - Array of insulin data entries.
 * @param basalProfile - Basal profile data.
 * @param startDate - Start date of the period.
 * @param endDate - End date of the period.
 * @returns Total basal and bolus insulin amounts.
 */
export const calculateTotalInsulin = (
  insulinData: InsulinDataEntry[],
  basalProfile: BasalProfile,
  startDate: Date,
  endDate: Date
): { totalBasal: number; totalBolus: number } => {
  // 1. Calculate the total scheduled basal insulin
  const totalScheduledBasalInsulin = calculateScheduledBasalInsulin(
    basalProfile,
    startDate,
    endDate
  );

  let totalBolusInsulin = 0;
  let totalTempBasalAdjustment = 0; // Difference between temp basal insulin and scheduled basal insulin

  // 2. Adjust for temp basal rates
  insulinData.forEach(entry => {
    switch (entry.type) {
      case 'bolus':
        totalBolusInsulin += entry.amount || 0;
        break;
      case 'tempBasal':
        if (entry.rate !== undefined && entry.duration !== undefined && entry.timestamp) {
          const tempBasalStart = new Date(entry.timestamp);
          const tempBasalEnd = new Date(tempBasalStart.getTime() + entry.duration * 60 * 1000); // duration in minutes

          // Calculate scheduled basal insulin during temp basal period
          const scheduledBasalDuringTemp = calculateScheduledBasalInsulin(
            basalProfile,
            tempBasalStart,
            tempBasalEnd
          );

          // Calculate temp basal insulin during this period
          const tempBasalInsulin = (entry.rate * entry.duration) / 60; // rate in U/hr, duration in minutes

          // Adjustment is the difference
          const adjustment = tempBasalInsulin - scheduledBasalDuringTemp;
          totalTempBasalAdjustment += adjustment;
        }
        break;
      case 'suspendPump':
        if (entry.startTime && entry.endTime) {
          const suspendStart = new Date(entry.startTime);
          const suspendEnd = new Date(entry.endTime);

          // Calculate scheduled basal insulin during suspension
          const scheduledBasalDuringSuspend = calculateScheduledBasalInsulin(
            basalProfile,
            suspendStart,
            suspendEnd
          );

          // Subtract insulin not delivered due to suspension
          totalTempBasalAdjustment -= scheduledBasalDuringSuspend;
        }
        break;
    }
  });

  // 3. Calculate total basal insulin
  const totalBasal = totalScheduledBasalInsulin + totalTempBasalAdjustment;

  return { totalBasal, totalBolus: totalBolusInsulin };
};
