import { InsulinDataEntry, BasalProfile } from 'app/types/insulin.types';
import { calculateTotalInsulin } from 'app/utils/insulin.utils/calculateTotalInsulin';

export interface InsulinStats {
  totalBasal: number;
  totalBolus: number;
  totalInsulin: number;
  basalBolusRatio: number;
}

/**
 * Computes insulin statistics from insulin and basal profile data.
 * @param insulinData - Array of insulin data entries.
 * @param basalProfileData - Basal profile data.
 * @param startDate - Start date of the period.
 * @param endDate - End date of the period.
 * @returns Computed insulin statistics.
 */
export const computeInsulinStats = (
  insulinData: InsulinDataEntry[],
  basalProfileData: BasalProfile,
  startDate: Date,
  endDate: Date
): InsulinStats => {
  const { totalBasal, totalBolus } = calculateTotalInsulin(
    insulinData,
    basalProfileData,
    startDate,
    endDate
  );
  const totalInsulin = totalBasal + totalBolus;
  const basalBolusRatio = totalBolus > 0 ? totalBasal / totalInsulin : 0;

  return {
    totalInsulin,
    totalBasal,
    totalBolus,
    basalBolusRatio,
  };
};
