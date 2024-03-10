import {InsulinDataEntry, BasalProfile} from 'app/types/insulin.types';
import {calculateTotalScheduledBasalInsulin} from 'app/utils/insulin.utils/calculateTotalScheduledBasalInsulin'; // Adjusted import paths as necessary

/**
 * Computes the basal rate over a given time period from the basal profile data.
 * @param startTime - The start time of the period in ISO string format.
 * @param endTime - The end time of the period in ISO string format.
 * @param basalProfileData - Array of basal profiles.
 * @returns The total basal rate for the given period.
 */
const baseBasalRateForPeriod = (
  startTime: string,
  endTime: string,
  basalProfileData: BasalProfile,
): number => {
  let baseRate = 0;
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();

  basalProfileData.forEach(profile => {
    const profileStart = new Date(profile.time).getTime(); // Assuming .time is the ISO string
    const profileEnd = profileStart + profile.value * 3600000; // Assuming .value represents duration in hours; adjust if needed

    if (profileStart <= end && profileEnd >= start) {
      const overlapStart = Math.max(start, profileStart);
      const overlapEnd = Math.min(end, profileEnd);
      const overlapDuration = (overlapEnd - overlapStart) / 3600000; // Convert milliseconds to hours

      baseRate += profile.value * overlapDuration; // Assuming .value represents the rate; adjust if needed
    }
  });

  return baseRate;
};

/**
 * Calculates the total insulin used, including bolus, basal, temp basal, and suspend pump.
 * @param insulinData - Array of insulin data records.
 * @param basalProfileData - Array of basal profile data.
 * @returns The total amount of insulin used.
 */
export const calculateTotalInsulin = (
  insulinData: InsulinDataEntry[],
  basalProfileData: BasalProfile,
): number => {
  let totalBolusInsulin = 0;
  let totalTempBasalInsulin = 0;

  insulinData.forEach(entry => {
    switch (entry.type) {
      case 'bolus':
        totalBolusInsulin += entry.amount || 0;
        break;
      case 'tempBasal':
        if (entry.rate && entry.duration) {
          totalTempBasalInsulin += entry.rate * entry.duration;
        }
        break;
      case 'suspendPump':
        if (
          entry.suspend &&
          entry.startTime &&
          entry.endTime &&
          entry.duration
        ) {
          totalTempBasalInsulin -=
            entry.duration *
              baseBasalRateForPeriod(
                entry.startTime,
                entry.endTime,
                basalProfileData,
              ) || 0;
        }
        break;
    }
  });

  const totalScheduledBasalInsulin =
    calculateTotalScheduledBasalInsulin(basalProfileData);

  return totalBolusInsulin + totalScheduledBasalInsulin + totalTempBasalInsulin;
};
