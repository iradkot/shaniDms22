import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {FoodItemDTO} from 'app/types/food.types';

export function mapNightscoutTreatmentsToInsulinDataEntries(
  treatments: any[] | null | undefined,
): InsulinDataEntry[] {
  return (treatments ?? [])
    .map((t: any) => {
      if (
        t?.insulin &&
        ['Bolus', 'Meal Bolus', 'Correction Bolus', 'Combo Bolus'].includes(t?.eventType)
      ) {
        return {
          type: 'bolus',
          amount: t.insulin || t.amount || 0,
          timestamp: t.created_at,
        } satisfies InsulinDataEntry;
      }

      if (t?.eventType === 'Temp Basal') {
        const startTime = typeof t.created_at === 'string' ? t.created_at : undefined;
        const durationMin =
          typeof t.duration === 'number' && Number.isFinite(t.duration) ? t.duration : 0;
        const endTime =
          startTime && durationMin > 0
            ? new Date(Date.parse(startTime) + durationMin * 60_000).toISOString()
            : undefined;

        return {
          type: 'tempBasal',
          rate: t.rate || 0,
          duration: durationMin,
          startTime,
          endTime,
          timestamp: startTime,
        } satisfies InsulinDataEntry;
      }
      return null;
    })
    .filter(Boolean) as InsulinDataEntry[];
}

export function mapNightscoutTreatmentsToCarbFoodItems(
  treatments: any[] | null | undefined,
): FoodItemDTO[] {
  return (treatments ?? [])
    .map((t: any) => {
      const carbs = t?.carbs;
      if (typeof carbs !== 'number' || !Number.isFinite(carbs) || carbs <= 0) {
        return null;
      }
      const createdAt = t?.created_at;
      const ts = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
      if (!Number.isFinite(ts)) return null;

      const id = typeof t?._id === 'string' ? t._id : `carbs-${ts}-${carbs}`;
      return {
        id,
        carbs,
        name: 'Carbs',
        image: '',
        notes: '',
        score: 0,
        timestamp: ts,
      } satisfies FoodItemDTO;
    })
    .filter(Boolean) as FoodItemDTO[];
}

export function extractBasalProfileFromNightscoutProfileData(
  profileData: any[] | null | undefined,
): BasalProfile {
  const first = profileData?.[0];
  const profileKey = first?.defaultProfile;
  const basal = first?.store?.[profileKey]?.basal;
  return Array.isArray(basal) ? basal : [];
}
