/**
 * Profile Parsing Utilities
 *
 * Pure functions for parsing Nightscout treatment events into
 * normalized ProfileChangeEvent objects.
 *
 * Supports:
 * - DIY Loop (iOS): "Profile Switch" events
 * - AndroidAPS: "Profile Switch" events with duration
 * - OpenAPS: "Profile Switch" events
 * - Generic notes containing profile keywords
 */

import {
  ProfileChangeEvent,
  LoopSystemSource,
} from 'app/types/loopAnalysis.types';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Event types that indicate a profile/settings change.
 */
const PROFILE_SWITCH_EVENT_TYPES = [
  'Profile Switch',
  'Profile switch',
  'profile switch',
  'Temp Basal',  // AndroidAPS sometimes logs this for profile changes
];

/**
 * Keywords in notes that might indicate a settings change.
 */
const SETTINGS_CHANGE_KEYWORDS = [
  'profile',
  'settings',
  'isf',
  'cr',
  'carb ratio',
  'basal',
  'target',
];

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Checks if a treatment object represents a profile switch event.
 */
export function isProfileSwitchTreatment(treatment: unknown): boolean {
  if (!treatment || typeof treatment !== 'object') return false;

  const t = treatment as Record<string, unknown>;
  const eventType = typeof t.eventType === 'string' ? t.eventType : '';

  // Direct match on event type
  if (PROFILE_SWITCH_EVENT_TYPES.some(e => eventType.toLowerCase() === e.toLowerCase())) {
    return true;
  }

  // Check for profile field (AndroidAPS specific)
  if (eventType === 'Profile Switch' || t.profile) {
    return true;
  }

  // Check notes for settings keywords (fallback for manual entries)
  const notes = typeof t.notes === 'string' ? t.notes.toLowerCase() : '';
  if (eventType === 'Note' && SETTINGS_CHANGE_KEYWORDS.some(kw => notes.includes(kw))) {
    return true;
  }

  return false;
}

// =============================================================================
// TIMESTAMP PARSING
// =============================================================================

/**
 * Extracts timestamp (ms) from a Nightscout treatment object.
 * Handles various timestamp formats used by different systems.
 */
export function parseTreatmentTimestamp(treatment: unknown): number | null {
  if (!treatment || typeof treatment !== 'object') return null;

  const t = treatment as Record<string, unknown>;

  // mills field (Nightscout native)
  if (typeof t.mills === 'number' && Number.isFinite(t.mills)) {
    return t.mills;
  }

  // created_at field (ISO string)
  if (typeof t.created_at === 'string') {
    const ms = Date.parse(t.created_at);
    if (Number.isFinite(ms)) return ms;
  }

  // timestamp field (some systems)
  if (typeof t.timestamp === 'string') {
    const ms = Date.parse(t.timestamp);
    if (Number.isFinite(ms)) return ms;
  }

  if (typeof t.timestamp === 'number' && Number.isFinite(t.timestamp)) {
    // Could be seconds or milliseconds
    return t.timestamp > 1e12 ? t.timestamp : t.timestamp * 1000;
  }

  return null;
}

// =============================================================================
// SOURCE DETECTION
// =============================================================================

/**
 * Detects the source system from a treatment object.
 */
export function detectSourceSystem(treatment: unknown): LoopSystemSource {
  if (!treatment || typeof treatment !== 'object') return 'unknown';

  const t = treatment as Record<string, unknown>;

  const enteredBy = typeof t.enteredBy === 'string' ? t.enteredBy.toLowerCase() : '';
  const notes = typeof t.notes === 'string' ? t.notes.toLowerCase() : '';
  const app = typeof t.app === 'string' ? t.app.toLowerCase() : '';

  // Loop iOS indicators
  if (
    enteredBy.includes('loop') ||
    notes.includes('loop') ||
    app.includes('loop')
  ) {
    return 'loop-ios';
  }

  // AndroidAPS indicators
  if (
    enteredBy.includes('androidaps') ||
    enteredBy.includes('aaps') ||
    notes.includes('aaps') ||
    app.includes('androidaps')
  ) {
    return 'androidaps';
  }

  // OpenAPS indicators
  if (
    enteredBy.includes('openaps') ||
    notes.includes('openaps') ||
    app.includes('openaps')
  ) {
    return 'openaps';
  }

  return 'unknown';
}

// =============================================================================
// MAIN PARSER
// =============================================================================

/**
 * Parses a Nightscout treatment into a normalized ProfileChangeEvent.
 * Returns null if the treatment cannot be parsed.
 */
export function parseProfileChangeFromTreatment(
  treatment: unknown
): ProfileChangeEvent | null {
  if (!treatment || typeof treatment !== 'object') return null;

  const t = treatment as Record<string, unknown>;

  const timestamp = parseTreatmentTimestamp(t);
  if (!timestamp) return null;

  const eventType = typeof t.eventType === 'string' ? t.eventType : 'Unknown';
  const source = detectSourceSystem(t);

  // Extract profile name
  let profileName: string | undefined;
  if (typeof t.profile === 'string' && t.profile.trim()) {
    profileName = t.profile.trim();
  } else if (typeof t.profileJson === 'string') {
    try {
      const parsed = JSON.parse(t.profileJson);
      if (parsed?.defaultProfile) {
        profileName = parsed.defaultProfile;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Extract duration (for temporary profiles)
  let durationMinutes: number | undefined;
  if (typeof t.duration === 'number' && Number.isFinite(t.duration) && t.duration > 0) {
    durationMinutes = t.duration;
  }

  // Build summary
  const summary = buildProfileChangeSummary(t, profileName, durationMinutes, source);

  // Generate unique ID
  const id = `profile_${timestamp}_${source}`;

  return {
    id,
    timestamp,
    source,
    eventType,
    profileName,
    summary,
    durationMinutes,
    _raw: treatment,
  };
}

/**
 * Builds a human-readable summary of the profile change.
 */
function buildProfileChangeSummary(
  treatment: Record<string, unknown>,
  profileName: string | undefined,
  durationMinutes: number | undefined,
  source: LoopSystemSource
): string {
  const parts: string[] = [];

  // Source
  const sourceLabel = {
    'loop-ios': 'Loop',
    'androidaps': 'AndroidAPS',
    'openaps': 'OpenAPS',
    'unknown': 'System',
  }[source];

  parts.push(`${sourceLabel}:`);

  // Profile name
  if (profileName) {
    parts.push(`Switched to "${profileName}"`);
  } else {
    parts.push('Profile changed');
  }

  // Duration
  if (durationMinutes && durationMinutes > 0) {
    if (durationMinutes >= 60) {
      const hours = Math.round(durationMinutes / 60 * 10) / 10;
      parts.push(`(${hours}h temporary)`);
    } else {
      parts.push(`(${durationMinutes}m temporary)`);
    }
  }

  // Notes
  const notes = typeof treatment.notes === 'string' ? treatment.notes.trim() : '';
  if (notes && notes.length < 50) {
    parts.push(`- ${notes}`);
  }

  return parts.join(' ');
}

// =============================================================================
// BATCH PARSER
// =============================================================================

/**
 * Filters and parses an array of treatments into ProfileChangeEvents.
 * Handles deduplication and sorting.
 */
export function parseProfileChangesFromTreatments(
  treatments: unknown[]
): ProfileChangeEvent[] {
  if (!Array.isArray(treatments)) return [];

  const events: ProfileChangeEvent[] = [];
  const seenIds = new Set<string>();

  for (const t of treatments) {
    if (!isProfileSwitchTreatment(t)) continue;

    const event = parseProfileChangeFromTreatment(t);
    if (!event) continue;

    // Deduplicate by ID
    if (seenIds.has(event.id)) continue;
    seenIds.add(event.id);

    events.push(event);
  }

  // Sort by timestamp descending (most recent first)
  events.sort((a, b) => b.timestamp - a.timestamp);

  return events;
}
