import { InsulinDataEntry, BasalProfile } from 'app/types/insulin.types';
import { calculateScheduledBasalInsulin } from './calculateScheduledBasalInsulin';

export const calculateTotalInsulin = (
  insulinData: InsulinDataEntry[],
  basalProfile: BasalProfile,
  startDate: Date,
  endDate: Date
): { totalBasal: number; totalBolus: number } => {
  // 1. total scheduled basal insulin
  const totalScheduledBasalInsulin = calculateScheduledBasalInsulin(
    basalProfile,
    startDate,
    endDate
  );

  let totalBolusInsulin = 0;
  let totalTempBasalAdjustment = 0;

  // 2. Adjust for temp basals
  insulinData.forEach(entry => {
    switch (entry.type) {
      case 'bolus':
        totalBolusInsulin += entry.amount || 0;
        break;
      case 'tempBasal':
        if (entry.rate !== undefined && entry.duration !== undefined && entry.timestamp) {
          const tempBasalStart = new Date(entry.timestamp);
          const tempBasalEnd = new Date(tempBasalStart.getTime() + entry.duration * 60 * 1000);

          // scheduled insulin during temp period
          const scheduledBasalDuringTemp = calculateScheduledBasalInsulin(
            basalProfile,
            tempBasalStart,
            tempBasalEnd
          );

          // tempBasalInsulin = rate(U/hr)*duration(hours)
          const tempBasalInsulin = (entry.rate * entry.duration) / 60;
          const adjustment = tempBasalInsulin - scheduledBasalDuringTemp;
          totalTempBasalAdjustment += adjustment;
        }
        break;
      case 'suspendPump':
        if (entry.startTime && entry.endTime) {
          const suspendStart = new Date(entry.startTime);
          const suspendEnd   = new Date(entry.endTime);

          const scheduledBasalDuringSuspend = calculateScheduledBasalInsulin(
            basalProfile,
            suspendStart,
            suspendEnd
          );

          // Because the pump was suspended, we remove that portion
          totalTempBasalAdjustment -= scheduledBasalDuringSuspend;
        }
        break;
    }
  });

  // 3. total basal = scheduled + adjustments from temp/suspend
  const totalBasal = totalScheduledBasalInsulin + totalTempBasalAdjustment;

  return { totalBasal, totalBolus: totalBolusInsulin };
};

