/**
 * Profile Parsing Utils Tests
 *
 * Unit tests for the profile change event parsing functions.
 */

import {
  isProfileSwitchTreatment,
  parseTreatmentTimestamp,
  detectSourceSystem,
  parseProfileChangeFromTreatment,
  parseProfileChangesFromTreatments,
} from '../../src/services/loopAnalysis/profileParsing.utils';

// =============================================================================
// MOCK DATA
// =============================================================================

const mockLoopProfileSwitch = {
  _id: '65f8a3b2c8e4a1001234abcd',
  eventType: 'Profile Switch',
  created_at: '2026-01-15T10:30:00.000Z',
  profile: 'High Activity',
  duration: 0,
  enteredBy: 'Loop',
  notes: 'Profile changed to High Activity',
  mills: 1736937000000,
};

const mockAndroidAPSProfileSwitch = {
  _id: '65f8a3b2c8e4a1001234abce',
  eventType: 'Profile Switch',
  created_at: '2026-01-14T08:00:00.000Z',
  profile: 'Workout',
  duration: 120,
  enteredBy: 'AndroidAPS',
  mills: 1736841600000,
};

const mockOpenAPSProfileSwitch = {
  _id: '65f8a3b2c8e4a1001234abcf',
  eventType: 'Profile Switch',
  created_at: '2026-01-13T12:00:00.000Z',
  profile: 'Default',
  enteredBy: 'openaps',
  mills: 1736769600000,
};

const mockNoteWithSettings = {
  _id: '65f8a3b2c8e4a1001234abd0',
  eventType: 'Note',
  created_at: '2026-01-12T14:00:00.000Z',
  notes: 'Changed ISF from 50 to 45 and basal rate',
  enteredBy: 'user',
  mills: 1736697600000,
};

const mockUnrelatedTreatment = {
  _id: '65f8a3b2c8e4a1001234abd1',
  eventType: 'Meal Bolus',
  created_at: '2026-01-15T12:00:00.000Z',
  insulin: 5,
  carbs: 60,
  mills: 1736942400000,
};

// =============================================================================
// TESTS: isProfileSwitchTreatment
// =============================================================================

describe('isProfileSwitchTreatment', () => {
  it('returns true for Loop Profile Switch', () => {
    expect(isProfileSwitchTreatment(mockLoopProfileSwitch)).toBe(true);
  });

  it('returns true for AndroidAPS Profile Switch', () => {
    expect(isProfileSwitchTreatment(mockAndroidAPSProfileSwitch)).toBe(true);
  });

  it('returns true for OpenAPS Profile Switch', () => {
    expect(isProfileSwitchTreatment(mockOpenAPSProfileSwitch)).toBe(true);
  });

  it('returns true for notes containing settings keywords', () => {
    expect(isProfileSwitchTreatment(mockNoteWithSettings)).toBe(true);
  });

  it('returns false for unrelated treatments', () => {
    expect(isProfileSwitchTreatment(mockUnrelatedTreatment)).toBe(false);
  });

  it('returns false for null/undefined', () => {
    expect(isProfileSwitchTreatment(null)).toBe(false);
    expect(isProfileSwitchTreatment(undefined)).toBe(false);
  });

  it('returns false for non-object values', () => {
    expect(isProfileSwitchTreatment('string')).toBe(false);
    expect(isProfileSwitchTreatment(123)).toBe(false);
  });

  it('handles case-insensitive event type matching', () => {
    expect(isProfileSwitchTreatment({eventType: 'profile switch'})).toBe(true);
    expect(isProfileSwitchTreatment({eventType: 'PROFILE SWITCH'})).toBe(true);
    expect(isProfileSwitchTreatment({eventType: 'Profile switch'})).toBe(true);
  });

  it('detects profile field presence', () => {
    expect(isProfileSwitchTreatment({eventType: 'Other', profile: 'Test'})).toBe(true);
  });
});

// =============================================================================
// TESTS: parseTreatmentTimestamp
// =============================================================================

describe('parseTreatmentTimestamp', () => {
  it('extracts mills field', () => {
    expect(parseTreatmentTimestamp({mills: 1736937000000})).toBe(1736937000000);
  });

  it('parses created_at ISO string', () => {
    const ts = parseTreatmentTimestamp({created_at: '2026-01-15T10:30:00.000Z'});
    expect(ts).toBe(Date.parse('2026-01-15T10:30:00.000Z'));
  });

  it('parses timestamp string', () => {
    const ts = parseTreatmentTimestamp({timestamp: '2026-01-15T10:30:00.000Z'});
    expect(ts).toBe(Date.parse('2026-01-15T10:30:00.000Z'));
  });

  it('handles timestamp as number (ms)', () => {
    expect(parseTreatmentTimestamp({timestamp: 1736937000000})).toBe(1736937000000);
  });

  it('handles timestamp as number (seconds) - converts to ms', () => {
    // 1736937000 seconds should be converted to ms
    expect(parseTreatmentTimestamp({timestamp: 1736937000})).toBe(1736937000000);
  });

  it('returns null for missing timestamp', () => {
    expect(parseTreatmentTimestamp({})).toBeNull();
  });

  it('returns null for invalid timestamp', () => {
    expect(parseTreatmentTimestamp({mills: NaN})).toBeNull();
    expect(parseTreatmentTimestamp({created_at: 'invalid'})).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(parseTreatmentTimestamp(null)).toBeNull();
    expect(parseTreatmentTimestamp(undefined)).toBeNull();
  });
});

// =============================================================================
// TESTS: detectSourceSystem
// =============================================================================

describe('detectSourceSystem', () => {
  it('detects Loop iOS', () => {
    expect(detectSourceSystem({enteredBy: 'Loop'})).toBe('loop-ios');
    expect(detectSourceSystem({enteredBy: 'loop/1.2.3'})).toBe('loop-ios');
    expect(detectSourceSystem({notes: 'From Loop app'})).toBe('loop-ios');
    expect(detectSourceSystem({app: 'Loop'})).toBe('loop-ios');
  });

  it('detects AndroidAPS', () => {
    expect(detectSourceSystem({enteredBy: 'AndroidAPS'})).toBe('androidaps');
    expect(detectSourceSystem({enteredBy: 'AAPS'})).toBe('androidaps');
    expect(detectSourceSystem({notes: 'via aaps'})).toBe('androidaps');
    expect(detectSourceSystem({app: 'AndroidAPS'})).toBe('androidaps');
  });

  it('detects OpenAPS', () => {
    expect(detectSourceSystem({enteredBy: 'openaps'})).toBe('openaps');
    expect(detectSourceSystem({notes: 'openaps rig'})).toBe('openaps');
    expect(detectSourceSystem({app: 'openaps'})).toBe('openaps');
  });

  it('returns unknown for unrecognized sources', () => {
    expect(detectSourceSystem({enteredBy: 'user'})).toBe('unknown');
    expect(detectSourceSystem({enteredBy: 'Nightscout'})).toBe('unknown');
    expect(detectSourceSystem({})).toBe('unknown');
  });

  it('returns unknown for null/undefined', () => {
    expect(detectSourceSystem(null)).toBe('unknown');
    expect(detectSourceSystem(undefined)).toBe('unknown');
  });
});

// =============================================================================
// TESTS: parseProfileChangeFromTreatment
// =============================================================================

describe('parseProfileChangeFromTreatment', () => {
  it('parses Loop profile switch correctly', () => {
    const event = parseProfileChangeFromTreatment(mockLoopProfileSwitch);

    expect(event).not.toBeNull();
    expect(event?.source).toBe('loop-ios');
    expect(event?.profileName).toBe('High Activity');
    expect(event?.timestamp).toBe(1736937000000);
    expect(event?.eventType).toBe('Profile Switch');
    expect(event?.summary).toContain('Loop');
    expect(event?.summary).toContain('High Activity');
  });

  it('parses AndroidAPS temporary profile correctly', () => {
    const event = parseProfileChangeFromTreatment(mockAndroidAPSProfileSwitch);

    expect(event).not.toBeNull();
    expect(event?.source).toBe('androidaps');
    expect(event?.profileName).toBe('Workout');
    expect(event?.durationMinutes).toBe(120);
    expect(event?.summary).toContain('2h temporary');
  });

  it('generates unique ID from timestamp and source', () => {
    const event = parseProfileChangeFromTreatment(mockLoopProfileSwitch);
    expect(event?.id).toBe('profile_1736937000000_loop-ios');
  });

  it('preserves raw treatment data', () => {
    const event = parseProfileChangeFromTreatment(mockLoopProfileSwitch);
    expect(event?._raw).toBe(mockLoopProfileSwitch);
  });

  it('returns null for invalid treatment', () => {
    expect(parseProfileChangeFromTreatment(null)).toBeNull();
    expect(parseProfileChangeFromTreatment({})).toBeNull();
    expect(parseProfileChangeFromTreatment({eventType: 'Profile Switch'})).toBeNull(); // No timestamp
  });

  it('parses note with settings keywords', () => {
    const event = parseProfileChangeFromTreatment(mockNoteWithSettings);

    expect(event).not.toBeNull();
    expect(event?.source).toBe('unknown');
    expect(event?.summary).toContain('ISF');
  });
});

// =============================================================================
// TESTS: parseProfileChangesFromTreatments
// =============================================================================

describe('parseProfileChangesFromTreatments', () => {
  const allTreatments = [
    mockLoopProfileSwitch,
    mockAndroidAPSProfileSwitch,
    mockOpenAPSProfileSwitch,
    mockNoteWithSettings,
    mockUnrelatedTreatment,
  ];

  it('filters and parses only profile-related treatments', () => {
    const events = parseProfileChangesFromTreatments(allTreatments);

    // Should include profile switches and settings note, but not meal bolus
    expect(events.length).toBe(4);
  });

  it('sorts by timestamp descending (most recent first)', () => {
    const events = parseProfileChangesFromTreatments(allTreatments);

    for (let i = 1; i < events.length; i++) {
      expect(events[i - 1].timestamp).toBeGreaterThanOrEqual(events[i].timestamp);
    }
  });

  it('deduplicates by ID', () => {
    const duplicates = [mockLoopProfileSwitch, mockLoopProfileSwitch];
    const events = parseProfileChangesFromTreatments(duplicates);

    expect(events.length).toBe(1);
  });

  it('returns empty array for empty input', () => {
    expect(parseProfileChangesFromTreatments([])).toEqual([]);
  });

  it('handles non-array input gracefully', () => {
    expect(parseProfileChangesFromTreatments(null as any)).toEqual([]);
    expect(parseProfileChangesFromTreatments(undefined as any)).toEqual([]);
  });
});
