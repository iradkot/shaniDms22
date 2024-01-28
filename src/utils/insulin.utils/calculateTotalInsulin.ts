// Imports a utility function for calculating total scheduled basal insulin
import {calculateTotalScheduledBasalInsulin} from 'app/utils/insulin.utils/calculateTotalScheduledBasalInsulin';

/**
 * Computes the basal rate over a given time period from the basal profile data.
 * @param {string} startTime - The start time of the period.
 * @param {string} endTime - The end time of the period.
 * @param {Array} basalProfileData - Array of basal profiles.
 * @returns {number} - The total basal rate for the given period.
 */
const baseBasalRateForPeriod = (startTime, endTime, basalProfileData) => {
  let baseRate = 0;
  const start = new Date(startTime);
  const end = new Date(endTime);

  basalProfileData.forEach((profile, index) => {
    console.log(index, profile);
    const profileStart = new Date(profile.startTime);
    const profileEnd = new Date(profile.endTime);

    if (profileStart <= end && profileEnd >= start) {
      const overlapStart = Math.max(start, profileStart);
      const overlapEnd = Math.min(end, profileEnd);
      const overlapDuration = (overlapEnd - overlapStart) / 3600000; // Convert milliseconds to hours

      baseRate += profile.rate * overlapDuration;
    }
  });

  return baseRate;
};

/**
 * Calculates the total insulin used, including bolus, basal, temp basal, and suspend pump.
 * @param {Array} insulinData - Array of insulin data records.
 * @param {Array} basalProfileData - Array of basal profile data.
 * @returns {number} - The total amount of insulin used.
 */
export const calculateTotalInsulin = (insulinData, basalProfileData) => {
  console.log({insulinData, basalProfileData});

  let totalBolusInsulin = 0;
  let totalTempBasalInsulin = 0;

  insulinData.forEach(entry => {
    switch (entry.type) {
      case 'bolus':
        totalBolusInsulin += entry.amount || 0;
        break;
      case 'tempBasal':
        totalTempBasalInsulin += entry.rate * entry.duration;
        break;
      case 'suspendPump':
        if (entry.suspend) {
          totalTempBasalInsulin -=
            entry.duration *
              baseBasalRateForPeriod(
                entry.startTime,
                entry.endTime,
                basalProfileData,
              ) || 0;
        }
        break;
      // Other types can be added here
    }
  });

  let totalScheduledBasalInsulin =
    calculateTotalScheduledBasalInsulin(basalProfileData);

  basalProfileData.forEach((profile, index) => {
    const rate = profile.store?.basalRate; // Adjust path based on data structure
    const duration =
      (new Date(profile.endTime) - new Date(profile.startTime)) / 3600000; // Duration in hours
    console.log('profileDataIndex', index, rate, duration);

    if (rate !== undefined && !isNaN(duration)) {
      totalScheduledBasalInsulin += rate * duration;
    }
  });

  console.log({
    totalBolusInsulin,
    totalScheduledBasalInsulin,
    totalTempBasalInsulin,
  });

  return totalBolusInsulin + totalScheduledBasalInsulin + totalTempBasalInsulin;
};
