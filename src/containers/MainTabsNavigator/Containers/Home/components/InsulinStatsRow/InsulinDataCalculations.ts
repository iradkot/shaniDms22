// InsulinDataCalculations.ts
import {InsulinDataEntry, BasalProfile} from 'app/types/insulin.types'; // Adjust import path as needed

/**
 * Calculates the total basal and bolus insulin for a given set of insulin data entries.
 * @param insulinData Array of insulin data entries
 * @returns The total basal and bolus insulin amounts
 */
function calculateTotalInsulin(insulinData: InsulinDataEntry[]): {
  totalBasal: number;
  totalBolus: number;
} {
  let totalBasal = 0;
  let totalBolus = 0;
  console.log('qwehjk', insulinData);
  insulinData.forEach(entry => {
    switch (entry.type) {
      case 'bolus':
        if (entry.amount) totalBolus += entry.amount;
        break;
      case 'tempBasal':
        // Assuming duration is in seconds, convert to hours for the calculation
        if (entry.rate && entry.duration) {
          let basalAmount = (entry.rate * entry.duration) / 3600;
          totalBasal += basalAmount;
        }
        break;
    }
  });

  return {totalBasal, totalBolus};
}

/**
 * Calculates the basal-bolus ratio from a set of insulin data entries.
 * @param insulinData Array of insulin data entries
 * @returns The basal to bolus ratio
 */
function calculateBasalBolusRatio(insulinData: InsulinDataEntry[]): number {
  const {totalBasal, totalBolus} = calculateTotalInsulin(insulinData);
  // Avoid division by zero
  return totalBolus > 0 ? totalBasal / totalBolus : 0;
}

export interface InsulinStats {
  totalBasal: number;
  totalBolus: number;
  basalBolusRatio: number;
}

/**
 * Computes insulin statistics from given insulin and basal profile data.
 * @param insulinData Array of insulin data entries
 * @param basalProfileData Basal profile data
 * @returns Computed insulin statistics
 */
export const computeInsulinStats = (
  insulinData: InsulinDataEntry[],
  basalProfileData: BasalProfile,
): InsulinStats => {
  const {totalBasal, totalBolus} = calculateTotalInsulin(insulinData);
  const basalBolusRatio = calculateBasalBolusRatio(insulinData);

  return {
    totalBasal,
    totalBolus,
    basalBolusRatio,
  };
};
