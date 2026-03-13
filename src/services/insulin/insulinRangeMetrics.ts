import {fetchTreatmentsForDateRangeUncached, getUserProfileFromNightscout} from 'app/api/apiRequests';
import {
  extractBasalProfileFromNightscoutProfileData,
  mapNightscoutTreatmentsToInsulinDataEntries,
} from 'app/utils/nightscoutTreatments.utils';
import {calculateTotalInsulin} from 'app/utils/insulin.utils/calculateTotalInsulin';

export type InsulinRangeMetrics = {
  totalBasal: number;
  totalBolus: number;
  totalInsulin: number;
  totalCarbs: number;
};

export async function getInsulinRangeMetrics(start: Date, end: Date): Promise<InsulinRangeMetrics> {
  const [treatments, profileData] = await Promise.all([
    fetchTreatmentsForDateRangeUncached(start, end),
    getUserProfileFromNightscout(start.toISOString()),
  ]);

  const insulinEntries = mapNightscoutTreatmentsToInsulinDataEntries(treatments ?? []);
  const basalProfile = extractBasalProfileFromNightscoutProfileData(profileData);

  const {totalBasal, totalBolus} = calculateTotalInsulin(insulinEntries, basalProfile, start, end);
  const totalInsulin = (totalBasal || 0) + (totalBolus || 0);
  const totalCarbs = (treatments ?? []).reduce((sum, t: any) => {
    const c = t?.carbs;
    return typeof c === 'number' && Number.isFinite(c) ? sum + c : sum;
  }, 0);

  return {totalBasal: totalBasal || 0, totalBolus: totalBolus || 0, totalInsulin, totalCarbs};
}
