/**
 * Settings Change Detection
 *
 * Detects actual user-initiated settings changes by comparing
 * consecutive Nightscout profiles. This excludes temp basals
 * and auto-adjustments, focusing only on permanent settings changes.
 *
 * Detects changes in:
 * - Carb Ratio (CR)
 * - Insulin Sensitivity Factor (ISF/CF)
 * - Target Range (low/high)
 * - Basal Rates
 * - DIA (Duration of Insulin Action)
 */

import {nightscoutInstance} from 'app/api/shaniNightscoutInstances';
import {ProfileDataEntry, TimeValueEntry} from 'app/types/insulin.types';

// =============================================================================
// TYPES
// =============================================================================

export type SettingsChangeType =
  | 'carb_ratio'
  | 'isf'
  | 'target_low'
  | 'target_high'
  | 'basal'
  | 'dia'
  | 'profile_switch';

/** Source of the settings change */
export type ChangeSource = 'user' | 'loop' | 'unknown';

/** Filter options for settings changes */
export type ChangeSourceFilter = 'all' | 'user' | 'loop';

/**
 * Determines the source of a profile change based on change types.
 * 
 * Profile settings (CR, ISF, targets, basal schedules, DIA) are ALWAYS user-initiated
 * because Loop doesn't auto-modify your saved profile - it only does temp basals.
 * 
 * Profile switches can be either:
 * - User-initiated (manually switching profiles)
 * - Loop-initiated (auto-switching based on overrides/schedules)
 * 
 * We use the enteredBy field to help distinguish profile switches,
 * but for actual settings changes, they're always user-initiated.
 */
function determineChangeSource(
  enteredBy: string,
  changeTypes: SettingsChangeType[],
): ChangeSource {
  // If there are actual settings changes (CR, ISF, targets, basal, DIA),
  // these are ALWAYS user-initiated - Loop doesn't modify saved profiles
  const hasSettingsChanges = changeTypes.some(
    t => t === 'carb_ratio' || 
         t === 'isf' || 
         t === 'target_low' || 
         t === 'target_high' || 
         t === 'basal' || 
         t === 'dia'
  );
  
  if (hasSettingsChanges) {
    return 'user';
  }
  
  // Only profile_switch - check enteredBy to guess if it was auto or manual
  const normalized = enteredBy.toLowerCase().trim();
  
  // Loop automatic profile switches
  if (
    normalized.includes('autosync') ||
    normalized.includes('auto') ||
    normalized.includes('override') ||
    normalized.includes('schedule')
  ) {
    return 'loop';
  }
  
  // If it's just "Loop" with only a profile switch, it's likely user-initiated
  // (user manually switched profiles in the Loop app)
  if (normalized === 'loop' || normalized.includes('loop')) {
    // Profile switches from Loop app are typically user-initiated
    return 'user';
  }
  
  return 'user'; // Default to user for profile-only changes
}

export interface SettingsChangeDetail {
  type: SettingsChangeType;
  /** Human-readable label */
  label: string;
  /** Time slot affected (e.g., "00:00", "08:00") or null for global */
  timeSlot: string | null;
  /** Previous value */
  oldValue: number | string | null;
  /** New value */
  newValue: number | string | null;
  /** Unit (e.g., "g/U", "mg/dL/U") */
  unit: string;
}

export interface SettingsChangeEvent {
  /** Unique ID */
  id: string;
  /** When the change occurred (ms since epoch) */
  timestamp: number;
  /** Profile name that was activated */
  profileName: string;
  /** What type of changes were made */
  changeTypes: SettingsChangeType[];
  /** Detailed list of changes */
  changes: SettingsChangeDetail[];
  /** Human-readable summary */
  summary: string;
  /** Who made the change */
  enteredBy: string;
  /** Source of the change (user, loop, or unknown) */
  source: ChangeSource;
  /** Raw profile for reference */
  _raw?: ProfileDataEntry;
}

// =============================================================================
// FETCH PROFILES
// =============================================================================

/**
 * Fetches profiles from Nightscout, sorted by date descending.
 */
export async function fetchNightscoutProfiles(params: {
  limit?: number;
  beforeDate?: Date;
}): Promise<ProfileDataEntry[]> {
  const {limit = 50, beforeDate} = params;

  let apiUrl = `/api/v1/profiles?sort[startDate]=-1&count=${limit}`;

  if (beforeDate) {
    apiUrl += `&find[startDate][$lt]=${beforeDate.toISOString()}`;
  }

  try {
    const response = await nightscoutInstance.get<ProfileDataEntry[]>(apiUrl);
    return response.data ?? [];
  } catch (error) {
    console.error('[settingsChangeDetection] Failed to fetch profiles:', error);
    return [];
  }
}

// =============================================================================
// COMPARE PROFILES
// =============================================================================

function getProfileTimestamp(profile: ProfileDataEntry): number {
  if (profile.mills) {
    const ms = typeof profile.mills === 'string' ? parseInt(profile.mills, 10) : profile.mills;
    if (Number.isFinite(ms)) return ms;
  }
  if (profile.startDate) {
    const ms = Date.parse(profile.startDate);
    if (Number.isFinite(ms)) return ms;
  }
  return 0;
}

function compareTimeValueArrays(
  oldArr: TimeValueEntry[] | undefined,
  newArr: TimeValueEntry[] | undefined,
  type: SettingsChangeType,
  label: string,
  unit: string
): SettingsChangeDetail[] {
  const changes: SettingsChangeDetail[] = [];
  const oldMap = new Map<string, number>();
  const newMap = new Map<string, number>();

  (oldArr ?? []).forEach(e => oldMap.set(e.time, e.value));
  (newArr ?? []).forEach(e => newMap.set(e.time, e.value));

  // Find all unique time slots
  const allTimes = new Set([...oldMap.keys(), ...newMap.keys()]);

  for (const time of allTimes) {
    const oldVal = oldMap.get(time);
    const newVal = newMap.get(time);

    if (oldVal !== newVal) {
      changes.push({
        type,
        label,
        timeSlot: time,
        oldValue: oldVal ?? null,
        newValue: newVal ?? null,
        unit,
      });
    }
  }

  return changes;
}

function compareBasalProfiles(
  oldBasal: TimeValueEntry[] | undefined,
  newBasal: TimeValueEntry[] | undefined
): SettingsChangeDetail[] {
  return compareTimeValueArrays(oldBasal, newBasal, 'basal', 'Basal Rate', 'U/hr');
}

function compareCarbRatios(
  oldCR: TimeValueEntry[] | undefined,
  newCR: TimeValueEntry[] | undefined
): SettingsChangeDetail[] {
  return compareTimeValueArrays(oldCR, newCR, 'carb_ratio', 'Carb Ratio', 'g/U');
}

function compareSensitivity(
  oldISF: TimeValueEntry[] | undefined,
  newISF: TimeValueEntry[] | undefined
): SettingsChangeDetail[] {
  return compareTimeValueArrays(oldISF, newISF, 'isf', 'Sensitivity (ISF)', 'mg/dL/U');
}

function compareTargetLow(
  oldTarget: TimeValueEntry[] | undefined,
  newTarget: TimeValueEntry[] | undefined
): SettingsChangeDetail[] {
  return compareTimeValueArrays(oldTarget, newTarget, 'target_low', 'Target Low', 'mg/dL');
}

function compareTargetHigh(
  oldTarget: TimeValueEntry[] | undefined,
  newTarget: TimeValueEntry[] | undefined
): SettingsChangeDetail[] {
  return compareTimeValueArrays(oldTarget, newTarget, 'target_high', 'Target High', 'mg/dL');
}

/**
 * Compares two profiles and returns the list of changes.
 */
export function compareProfiles(
  oldProfile: ProfileDataEntry | null,
  newProfile: ProfileDataEntry
): SettingsChangeDetail[] {
  const changes: SettingsChangeDetail[] = [];

  const newProfileName = newProfile.defaultProfile;
  const newStore = newProfile.store?.[newProfileName];

  if (!newStore) return changes;

  // If no old profile, this is the first profile - no changes to report
  if (!oldProfile) {
    return [];
  }

  const oldProfileName = oldProfile.defaultProfile;
  const oldStore = oldProfile.store?.[oldProfileName];

  // Profile switch (different profile name activated)
  if (oldProfileName !== newProfileName) {
    changes.push({
      type: 'profile_switch',
      label: 'Profile',
      timeSlot: null,
      oldValue: oldProfileName,
      newValue: newProfileName,
      unit: '',
    });
  }

  if (!oldStore) return changes;

  // Compare all settings
  changes.push(...compareCarbRatios(oldStore.carbratio, newStore.carbratio));
  changes.push(...compareSensitivity(oldStore.sens, newStore.sens));
  changes.push(...compareTargetLow(oldStore.target_low, newStore.target_low));
  changes.push(...compareTargetHigh(oldStore.target_high, newStore.target_high));
  changes.push(...compareBasalProfiles(oldStore.basal, newStore.basal));

  // DIA change
  if (oldStore.dia !== newStore.dia) {
    changes.push({
      type: 'dia',
      label: 'Duration of Insulin Action',
      timeSlot: null,
      oldValue: oldStore.dia,
      newValue: newStore.dia,
      unit: 'hours',
    });
  }

  return changes;
}

// =============================================================================
// GENERATE SUMMARY
// =============================================================================

function generateChangeSummary(changes: SettingsChangeDetail[]): string {
  if (changes.length === 0) return 'No changes detected';

  const typeLabels: Record<SettingsChangeType, string> = {
    carb_ratio: 'Carb Ratio',
    isf: 'ISF',
    target_low: 'Target Low',
    target_high: 'Target High',
    basal: 'Basal',
    dia: 'DIA',
    profile_switch: 'Profile',
  };

  const typeCounts = new Map<SettingsChangeType, number>();
  for (const c of changes) {
    typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
  }

  const parts: string[] = [];
  for (const [type, count] of typeCounts) {
    if (type === 'profile_switch') {
      const change = changes.find(c => c.type === 'profile_switch');
      parts.push(`Switched to "${change?.newValue}"`);
    } else if (count === 1) {
      const change = changes.find(c => c.type === type);
      if (change && change.oldValue != null && change.newValue != null) {
        parts.push(`${typeLabels[type]}: ${change.oldValue} → ${change.newValue}`);
      } else {
        parts.push(`${typeLabels[type]} changed`);
      }
    } else {
      parts.push(`${typeLabels[type]} (${count} time slots)`);
    }
  }

  return parts.join(', ');
}

// =============================================================================
// DETECT SETTINGS CHANGES
// =============================================================================

/**
 * Fetches and detects settings changes from Nightscout profiles.
 *
 * @param params.minEvents - Minimum events to return (will fetch more if needed)
 * @param params.beforeTimestamp - Only return events before this timestamp (for pagination)
 * @param params.sourceFilter - Filter by source ('all', 'user', 'loop')
 * @returns Array of SettingsChangeEvent, sorted by timestamp descending
 */
export async function detectSettingsChanges(params?: {
  minEvents?: number;
  beforeTimestamp?: number;
  sourceFilter?: ChangeSourceFilter;
}): Promise<SettingsChangeEvent[]> {
  const minEvents = params?.minEvents ?? 20;
  const beforeTimestamp = params?.beforeTimestamp;
  const sourceFilter = params?.sourceFilter ?? 'all';

  const events: SettingsChangeEvent[] = [];
  let profiles: ProfileDataEntry[] = [];
  let fetchBefore = beforeTimestamp ? new Date(beforeTimestamp) : undefined;
  let iterations = 0;
  const maxIterations = 5; // Safety limit

  // Keep fetching until we have enough events
  while (events.length < minEvents && iterations < maxIterations) {
    iterations++;

    const batch = await fetchNightscoutProfiles({
      limit: 50,
      beforeDate: fetchBefore,
    });

    if (batch.length === 0) break;

    profiles = [...profiles, ...batch];

    // Update cursor for next fetch
    const lastProfile = batch[batch.length - 1];
    const lastTs = getProfileTimestamp(lastProfile);
    if (lastTs > 0) {
      fetchBefore = new Date(lastTs - 1);
    } else {
      break;
    }

    // Re-process all profiles to detect changes
    events.length = 0;
    
    // Sort profiles by timestamp descending (newest first)
    const sortedProfiles = profiles
      .filter(p => getProfileTimestamp(p) > 0)
      .sort((a, b) => getProfileTimestamp(b) - getProfileTimestamp(a));

    for (let i = 0; i < sortedProfiles.length; i++) {
      const current = sortedProfiles[i];
      const previous = sortedProfiles[i + 1] ?? null;

      const changes = compareProfiles(previous, current);

      // Only include if there are actual changes
      if (changes.length > 0) {
        const timestamp = getProfileTimestamp(current);
        const changeTypes = [...new Set(changes.map(c => c.type))] as SettingsChangeType[];
        const enteredBy = current.enteredBy || 'Unknown';
        const source = determineChangeSource(enteredBy, changeTypes);

        // Apply source filter
        if (sourceFilter !== 'all') {
          if (sourceFilter === 'user' && source !== 'user') continue;
          if (sourceFilter === 'loop' && source !== 'loop') continue;
        }

        events.push({
          id: `${timestamp}-${current._id}`,
          timestamp,
          profileName: current.defaultProfile,
          changeTypes,
          changes,
          summary: generateChangeSummary(changes),
          enteredBy,
          source,
          _raw: current,
        });
      }
    }
  }

  return events;
}

/**
 * Checks if there are more events available before a given timestamp.
 */
export async function hasMoreSettingsChanges(beforeTimestamp: number): Promise<boolean> {
  const batch = await fetchNightscoutProfiles({
    limit: 1,
    beforeDate: new Date(beforeTimestamp - 1),
  });
  return batch.length > 0;
}
