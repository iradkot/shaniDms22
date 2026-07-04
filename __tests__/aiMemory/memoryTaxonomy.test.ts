import {
  memoryFolderKey,
  normalizeMemoryFolder,
  pregnancyRetentionPolicy,
  shouldUseDetailedMemory,
} from '../../src/services/aiMemory/memoryTaxonomy';

describe('memoryTaxonomy', () => {
  it('normalizes memory folders with a stable key', () => {
    const folder = normalizeMemoryFolder({
      category: 'preferences',
      path: [' communication_style ', '', 'tone'],
    });

    expect(folder).toEqual({
      category: 'preferences',
      path: ['communication_style', 'tone'],
    });
    expect(memoryFolderKey(folder)).toBe('preferences/communication_style/tone');
  });

  it('keeps pregnancy context detailed while active and remembered later', () => {
    const nowMs = Date.UTC(2026, 0, 1);
    const dueDateMs = Date.UTC(2026, 8, 1);
    const policy = pregnancyRetentionPolicy({nowMs, dueDateMs});

    expect(policy.activeUntil).toBe(dueDateMs);
    expect(policy.rememberUntil).toBeGreaterThan(dueDateMs);
    expect(shouldUseDetailedMemory(policy, Date.UTC(2026, 6, 1))).toBe(true);
    expect(shouldUseDetailedMemory(policy, Date.UTC(2027, 0, 1))).toBe(false);
  });
});
