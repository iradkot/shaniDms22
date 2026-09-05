import {
  parseActivityEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseRevision,
  parseWorkspaceId,
} from '../../src/modules/journal';
import type {ActivitySnapshot, ParseResult} from '../../src/modules/journal';
import {selectActivityCard} from '../../src/product/activities';

const valueOf = <T>(result: ParseResult<T>): T => {
  if (!result.ok) {
    throw new Error('Invalid test value.');
  }
  return result.value;
};

const activity = (
  overrides: Partial<ActivitySnapshot> = {},
): ActivitySnapshot => ({
  kind: 'activity',
  id: valueOf(parseActivityEntryId('activity-1')),
  scope: {
    productUserId: valueOf(parseProductUserId('user-1')),
    workspaceId: valueOf(parseWorkspaceId('workspace-1')),
    nightscoutSourceId: valueOf(parseNightscoutSourceId('nightscout-1')),
  },
  revision: valueOf(parseRevision(1)),
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  lifecycle: {kind: 'active'},
  syncState: {
    kind: 'pending',
    queuedAt: 1_700_000_000_000,
    operationCount: 1,
  },
  category: 'walking',
  startedAt: 1_700_000_000_000,
  endedAt: 1_700_000_030_000,
  intensity: 'medium',
  tags: [],
  externalLinks: [],
  ...overrides,
});

describe('Activity presentation selectors', () => {
  it('shows category, duration, intensity, and sync state without a score', () => {
    const card = selectActivityCard(
      activity({endedAt: 1_700_000_900_000}),
      'en',
      () => '20:15',
      1_700_001_000_000,
    );

    expect(card).toMatchObject({
      title: 'Walking',
      timeLabel: '20:15',
      stateLabel: 'Finished',
      durationLabel: '15 min',
      intensityLabel: 'Medium',
      syncLabel: 'Waiting to sync',
      ongoing: false,
    });
    expect(card).not.toHaveProperty('score');
  });

  it('uses the custom name and calculates elapsed time for an ongoing activity', () => {
    const ongoing = activity({
      category: 'other',
      customName: 'Pilates',
    });
    const ongoingWithoutEnd = {...ongoing};
    delete ongoingWithoutEnd.endedAt;
    const card = selectActivityCard(
      ongoingWithoutEnd,
      'en',
      () => '09:00',
      ongoingWithoutEnd.startedAt + 32 * 60_000,
    );

    expect(card.title).toBe('Pilates');
    expect(card.stateLabel).toBe('In progress');
    expect(card.durationLabel).toBe('32 min');
    expect(card.ongoing).toBe(true);
  });

  it('uses clear Hebrew labels for conflicts', () => {
    const card = selectActivityCard(
      activity({
        category: 'strength',
        syncState: {
          kind: 'conflict',
          detectedAt: 1_700_000_000_000,
          conflictingFields: ['intensity'],
        },
      }),
      'he',
      () => '18:30',
      1_700_001_000_000,
    );

    expect(card.title).toBe('אימון כוח');
    expect(card.syncLabel).toBe('יש התנגשות בעריכה');
    expect(card.syncTone).toBe('warning');
  });
});
