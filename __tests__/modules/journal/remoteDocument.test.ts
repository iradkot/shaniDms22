import type {
  ActivitySnapshot,
  MealSnapshot,
} from '../../../src/modules/journal';
import {
  createExternalRecordKey,
  parseActivityEntryId,
  parseMealEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseRevision,
  parseWorkspaceId,
} from '../../../src/modules/journal/domain/identifiers';
import type {JournalWorkspaceScope} from '../../../src/modules/journal/domain/journal';
import type {ParseResult} from '../../../src/modules/journal/domain/validation';
import {
  decodeRemoteActivityDocument,
  decodeRemoteJournalDocument,
  decodeRemoteMealDocument,
  projectActivityRemoteDocument,
  projectMealRemoteDocument,
} from '../../../src/modules/journal/sync';

const CREATED_AT = 1_700_000_000_000;
const UPDATED_AT = CREATED_AT + 60_000;

const valueOf = <T>(result: ParseResult<T>): T => {
  if (!result.ok) {
    throw new Error(JSON.stringify(result.issues));
  }
  return result.value;
};

const scope = (): JournalWorkspaceScope => ({
  productUserId: valueOf(parseProductUserId('owner-1')),
  workspaceId: valueOf(parseWorkspaceId('workspace-1')),
  nightscoutSourceId: valueOf(parseNightscoutSourceId('nightscout-1')),
});

const mealSnapshot = (): MealSnapshot => {
  const journalScope = scope();
  const recordKey = createExternalRecordKey(
    journalScope.nightscoutSourceId,
    '_id',
    'external-carb-1',
  );
  return {
    kind: 'meal',
    id: valueOf(parseMealEntryId('meal-1')),
    scope: journalScope,
    revision: valueOf(parseRevision(3)),
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    lifecycle: {kind: 'active'},
    syncState: {
      kind: 'failed',
      failedAt: UPDATED_AT,
      code: 'journal.sync.network',
      retryable: true,
      message: 'LOCAL_SYNC_FAILURE_MARKER',
    },
    mealStart: CREATED_AT,
    name: 'Pasta',
    mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 45},
    image: {
      mimeType: 'image/jpeg',
      fileName: 'PRIVATE_FILE_NAME.jpg',
      syncState: {
        kind: 'local_only',
        localUri: 'file:///private/LOCAL_IMAGE_URI_MARKER.jpg',
      },
    },
    notes: 'Dinner',
    tags: ['home'],
    externalLinks: [
      {
        record: {
          nightscoutSourceId: journalScope.nightscoutSourceId,
          recordKey,
          identifiers: {_id: 'external-carb-1'},
        },
        role: {kind: 'reported_carbohydrate', purpose: 'meal'},
        linkedAt: UPDATED_AT,
        external: {
          kind: 'available',
          checkedAt: UPDATED_AT,
          snapshot: {
            kind: 'carbohydrate',
            externalCarbTime: CREATED_AT,
            carbohydratesGrams: 987.65,
            eventType: 'RAW_NIGHTSCOUT_EVENT_MARKER',
            enteredBy: 'RAW_NIGHTSCOUT_AUTHOR_MARKER',
          },
        },
      },
    ],
    reportedCarbohydrates: {
      kind: 'reported_carbohydrates',
      totalGrams: 987.65,
      componentCount: 1,
      knownComponentCount: 1,
      stale: false,
      components: [
        {
          recordKey,
          grams: 987.65,
          externalCarbTime: CREATED_AT,
          stale: false,
        },
      ],
    },
  };
};

const activitySnapshot = (): ActivitySnapshot => {
  const journalScope = scope();
  const recordKey = createExternalRecordKey(
    journalScope.nightscoutSourceId,
    'identifier',
    'external-activity-1',
  );
  return {
    kind: 'activity',
    id: valueOf(parseActivityEntryId('activity-1')),
    scope: journalScope,
    revision: valueOf(parseRevision(2)),
    createdAt: CREATED_AT,
    updatedAt: UPDATED_AT,
    lifecycle: {
      kind: 'trashed',
      trashedAt: UPDATED_AT,
      purgeAfter: UPDATED_AT + 30 * 24 * 60 * 60 * 1000,
    },
    syncState: {kind: 'pending', queuedAt: UPDATED_AT, operationCount: 1},
    category: 'running',
    startedAt: CREATED_AT,
    endedAt: CREATED_AT + 30 * 60_000,
    intensity: 'high',
    notes: 'Intervals',
    tags: ['outside'],
    externalLinks: [
      {
        record: {
          nightscoutSourceId: journalScope.nightscoutSourceId,
          recordKey,
          identifiers: {identifier: 'external-activity-1'},
        },
        role: {kind: 'activity'},
        linkedAt: UPDATED_AT,
        external: {
          kind: 'unavailable',
          checkedAt: UPDATED_AT,
          reason: 'source_unavailable',
          lastKnown: {
            kind: 'activity',
            startedAt: CREATED_AT,
            eventType: 'CACHED_ACTIVITY_EVENT_MARKER',
            enteredBy: 'CACHED_ACTIVITY_AUTHOR_MARKER',
          },
        },
      },
    ],
  };
};

describe('remote Journal document projection', () => {
  it('projects a Meal from an explicit whitelist without local or Nightscout cache leaks', () => {
    const local = {
      ...mealSnapshot(),
      conflicts: [{secret: 'LOCAL_CONFLICT_MARKER'}],
      outbox: [{secret: 'LOCAL_OUTBOX_MARKER'}],
    } as MealSnapshot;
    const projected = projectMealRemoteDocument(local);
    expect(projected.ok).toBe(true);
    if (!projected.ok) {
      return;
    }

    expect(projected.value).toMatchObject({
      schemaVersion: 1,
      documentKind: 'meal',
      scope: {
        ownerProductUserId: 'owner-1',
        workspaceId: 'workspace-1',
        nightscoutSourceId: 'nightscout-1',
      },
      entityId: 'meal-1',
      revision: 3,
      image: {
        kind: 'omitted',
        reason: 'remote_object_identity_unavailable',
      },
      externalLinks: [
        {
          identity: {
            nightscoutSourceId: 'nightscout-1',
            namespace: '_id',
            value: 'external-carb-1',
          },
          role: {kind: 'reported_carbohydrate', purpose: 'meal'},
          linkedAt: UPDATED_AT,
        },
      ],
    });
    expect(projected.value).not.toHaveProperty('syncState');
    expect(projected.value).not.toHaveProperty('reportedCarbohydrates');
    expect(projected.value).not.toHaveProperty('conflicts');
    expect(projected.value).not.toHaveProperty('outbox');

    const serialised = JSON.stringify(projected.value);
    [
      'LOCAL_SYNC_FAILURE_MARKER',
      'LOCAL_IMAGE_URI_MARKER',
      'PRIVATE_FILE_NAME',
      'RAW_NIGHTSCOUT_EVENT_MARKER',
      'RAW_NIGHTSCOUT_AUTHOR_MARKER',
      'LOCAL_CONFLICT_MARKER',
      'LOCAL_OUTBOX_MARKER',
      '987.65',
    ].forEach(marker => expect(serialised).not.toContain(marker));
  });

  it('projects Activity App-Owned data but no cached external availability or snapshot', () => {
    const projected = projectActivityRemoteDocument(activitySnapshot());
    expect(projected.ok).toBe(true);
    if (!projected.ok) {
      return;
    }

    expect(projected.value).toMatchObject({
      documentKind: 'activity',
      entityId: 'activity-1',
      lifecycle: {kind: 'trashed'},
      category: 'running',
      intensity: 'high',
      externalLinks: [
        {
          identity: {
            namespace: 'identifier',
            value: 'external-activity-1',
          },
          role: {kind: 'activity'},
        },
      ],
    });
    expect(projected.value).not.toHaveProperty('syncState');
    const serialised = JSON.stringify(projected.value);
    expect(serialised).not.toContain('CACHED_ACTIVITY_EVENT_MARKER');
    expect(serialised).not.toContain('CACHED_ACTIVITY_AUTHOR_MARKER');
    expect(serialised).not.toContain('source_unavailable');
    expect(serialised).not.toContain('checkedAt');
  });

  it('round-trips both versioned document kinds through strict runtime decoders', () => {
    const meal = projectMealRemoteDocument(mealSnapshot());
    const activity = projectActivityRemoteDocument(activitySnapshot());
    expect(meal.ok).toBe(true);
    expect(activity.ok).toBe(true);
    if (!meal.ok || !activity.ok) {
      return;
    }

    expect(decodeRemoteMealDocument(meal.value)).toEqual(meal);
    expect(decodeRemoteActivityDocument(activity.value)).toEqual(activity);
    expect(decodeRemoteJournalDocument(meal.value)).toEqual(meal);
    expect(decodeRemoteJournalDocument(activity.value)).toEqual(activity);
  });

  it.each([
    ['top-level sync state', {syncState: {kind: 'synced'}}],
    ['reported carbohydrates', {reportedCarbohydrates: {totalGrams: 45}}],
    ['conflicts', {conflicts: []}],
    ['outbox', {outbox: []}],
  ])('rejects forbidden or unknown %s fields', (_label, leakedField) => {
    const projected = projectMealRemoteDocument(mealSnapshot());
    if (!projected.ok) {
      throw new Error(JSON.stringify(projected.issues));
    }
    const decoded = decodeRemoteMealDocument({
      ...projected.value,
      ...leakedField,
    });
    expect(decoded.ok).toBe(false);
  });

  it('rejects cached external data and local URIs even when nested', () => {
    const projected = projectMealRemoteDocument(mealSnapshot());
    if (!projected.ok) {
      throw new Error(JSON.stringify(projected.issues));
    }
    const firstLink = projected.value.externalLinks[0];
    if (firstLink === undefined) {
      throw new Error('Expected one projected link.');
    }

    const linkLeak = decodeRemoteMealDocument({
      ...projected.value,
      externalLinks: [
        {
          ...firstLink,
          external: {kind: 'available', snapshot: {sgv: 101}},
        },
      ],
    });
    const imageLeak = decodeRemoteMealDocument({
      ...projected.value,
      image: {...projected.value.image, localUri: 'file:///private.jpg'},
    });

    expect(linkLeak.ok).toBe(false);
    expect(imageLeak.ok).toBe(false);
  });

  it('rejects malformed versions, owner scope, and external identity', () => {
    const projected = projectMealRemoteDocument(mealSnapshot());
    if (!projected.ok) {
      throw new Error(JSON.stringify(projected.issues));
    }
    const firstLink = projected.value.externalLinks[0];
    if (firstLink === undefined) {
      throw new Error('Expected one projected link.');
    }

    expect(
      decodeRemoteMealDocument({...projected.value, schemaVersion: 2}).ok,
    ).toBe(false);
    expect(
      decodeRemoteMealDocument({
        ...projected.value,
        scope: {...projected.value.scope, ownerProductUserId: ' '},
      }).ok,
    ).toBe(false);
    expect(
      decodeRemoteMealDocument({
        ...projected.value,
        externalLinks: [
          {
            ...firstLink,
            identity: {
              ...firstLink.identity,
              recordKey: 'mismatched-record-key',
            },
          },
        ],
      }).ok,
    ).toBe(false);
  });

  it('refuses to project a forged local link whose key and identity disagree', () => {
    const local = mealSnapshot();
    const firstLink = local.externalLinks[0];
    if (firstLink === undefined) {
      throw new Error('Expected one local link.');
    }
    const forged: MealSnapshot = {
      ...local,
      externalLinks: [
        {
          ...firstLink,
          record: {
            ...firstLink.record,
            recordKey: createExternalRecordKey(
              local.scope.nightscoutSourceId,
              '_id',
              'different-record',
            ),
          },
        },
      ],
    };

    expect(projectMealRemoteDocument(forged).ok).toBe(false);
  });
});
