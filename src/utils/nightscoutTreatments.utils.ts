import {BasalProfile, InsulinDataEntry} from 'app/types/insulin.types';
import {FoodItemDTO} from 'app/types/food.types';
import {parseTagsFromNotes} from 'app/services/mealTagService';

function insulinEntryStartMs(entry: InsulinDataEntry): number {
  const raw = entry.startTime ?? entry.timestamp;
  return raw ? Date.parse(raw) : NaN;
}

function insulinEntryEndMs(entry: InsulinDataEntry, startMs: number): number {
  if (entry.endTime) {
    const explicitEnd = Date.parse(entry.endTime);
    if (Number.isFinite(explicitEnd)) return explicitEnd;
  }
  return typeof entry.duration === 'number' && Number.isFinite(entry.duration)
    ? startMs + Math.max(0, entry.duration) * 60_000
    : startMs;
}

function finiteNumber(value: unknown): number | null {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function treatmentTimestamp(treatment: any): string | undefined {
  for (const value of [treatment?.created_at, treatment?.timestamp]) {
    if (typeof value === 'string' && Number.isFinite(Date.parse(value))) {
      return new Date(Date.parse(value)).toISOString();
    }
  }
  return undefined;
}

export function mapNightscoutTreatmentsToInsulinDataEntries(
  treatments: any[] | null | undefined,
): InsulinDataEntry[] {
  const sourceTreatments = treatments ?? [];
  const resumeTimes = sourceTreatments
    .filter((t: any) => /^(Resume Pump|Pump Resume)$/i.test(t?.eventType ?? ''))
    .map(treatmentTimestamp)
    .filter((value): value is string => Boolean(value))
    .map(value => Date.parse(value));

  const mapped = sourceTreatments
    .map((t: any) => {
      const timestamp = treatmentTimestamp(t);
      const insulin = finiteNumber(t?.insulin) ?? finiteNumber(t?.amount);
      const eventType = typeof t?.eventType === 'string' ? t.eventType : '';

      if (timestamp && insulin != null && insulin > 0 && /bolus/i.test(eventType)) {
        return {
          type: 'bolus',
          amount: insulin,
          timestamp,
        } satisfies InsulinDataEntry;
      }

      if (eventType === 'Temp Basal' && timestamp) {
        const durationMin = Math.max(0, finiteNumber(t?.duration) ?? 0);
        const parsedRate = finiteNumber(t?.rate) ?? finiteNumber(t?.absolute);
        const rate = parsedRate ?? (durationMin === 0 ? 0 : null);
        if (rate == null || rate < 0) return null;
        const endTime =
          new Date(Date.parse(timestamp) + durationMin * 60_000).toISOString();

        return {
          type: 'tempBasal',
          rate,
          duration: durationMin,
          startTime: timestamp,
          endTime,
          timestamp,
        } satisfies InsulinDataEntry;
      }

      if (/^(Suspend Pump|Pump Suspend)$/i.test(eventType) && timestamp) {
        return {
          type: 'suspendPump',
          suspend: true,
          startTime: timestamp,
          timestamp,
        } satisfies InsulinDataEntry;
      }
      return null;
    })
    .filter(Boolean) as InsulinDataEntry[];

  const sorted = mapped.sort(
    (a, b) => insulinEntryStartMs(a) - insulinEntryStartMs(b),
  );
  for (let index = 0; index < sorted.length; index++) {
    const entry = sorted[index];
    if (entry.type !== 'suspendPump' || entry.endTime) continue;
    const startMs = insulinEntryStartMs(entry);
    const nextBasalControlMs = sorted
      .slice(index + 1)
      .filter(next => next.type === 'tempBasal' || next.type === 'suspendPump')
      .map(insulinEntryStartMs)
      .find(nextMs => nextMs > startMs);
    const nextResumeMs = resumeTimes
      .filter(resumeMs => resumeMs > startMs)
      .sort((a, b) => a - b)[0];
    const nextStartMs = Math.min(
      nextBasalControlMs ?? Number.POSITIVE_INFINITY,
      nextResumeMs ?? Number.POSITIVE_INFINITY,
    );
    if (Number.isFinite(nextStartMs)) {
      entry.endTime = new Date(nextStartMs).toISOString();
      entry.duration = Math.max(
        0,
        (nextStartMs - startMs) / 60_000,
      );
    }
  }
  return sorted;
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
      const rawNotes = typeof t?.notes === 'string' ? t.notes : '';
      return {
        id,
        carbs,
        name: 'Carbs',
        image: '',
        notes: rawNotes,
        score: 0,
        timestamp: ts,
        tags: parseTagsFromNotes(rawNotes),
      } satisfies FoodItemDTO;
    })
    .filter(Boolean) as FoodItemDTO[];
}

export function filterInsulinDataToRange(
  insulinData: InsulinDataEntry[],
  startMs: number,
  endMs: number,
): InsulinDataEntry[] {
  return insulinData.filter(entry => {
    const entryStartMs = insulinEntryStartMs(entry);
    if (!Number.isFinite(entryStartMs)) return false;
    if (entry.type === 'bolus') {
      return entryStartMs >= startMs && entryStartMs <= endMs;
    }
    const entryEndMs = insulinEntryEndMs(entry, entryStartMs);
    return entryEndMs === entryStartMs
      ? entryStartMs >= startMs && entryStartMs <= endMs
      : entryStartMs <= endMs && entryEndMs > startMs;
  });
}

export function filterFoodItemsToRange(
  foodItems: FoodItemDTO[],
  startMs: number,
  endMs: number,
): FoodItemDTO[] {
  return foodItems.filter(
    item =>
      typeof item.timestamp === 'number' &&
      Number.isFinite(item.timestamp) &&
      item.timestamp >= startMs &&
      item.timestamp <= endMs,
  );
}

export function extractBasalProfileFromNightscoutProfileData(
  profileData: any[] | null | undefined,
): BasalProfile {
  const first = profileData?.[0];
  const profileKey = first?.defaultProfile;
  const basal = first?.store?.[profileKey]?.basal;
  return Array.isArray(basal) ? basal : [];
}
