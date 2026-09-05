import {
  hydrateRemoteMealDocument,
  projectMealRemoteDocument,
  decodeRemoteMealDocument,
} from '../../../src/modules/journal/sync';
import {
  parseMealEntryId,
  parseNightscoutSourceId,
  parseProductUserId,
  parseRevision,
  parseWorkspaceId,
  type JournalWorkspaceScope,
  type MealSnapshot,
} from '../../../src/modules/journal';

const valueOf = <T>(result: {ok: true; value: T} | {ok: false}): T => {
  if (!result.ok) {
    throw new Error('Invalid fixture.');
  }
  return result.value;
};

const scope: JournalWorkspaceScope = {
  productUserId: valueOf(parseProductUserId('owner-1')),
  workspaceId: valueOf(parseWorkspaceId('workspace-1')),
  nightscoutSourceId: valueOf(parseNightscoutSourceId('source-1')),
};

const snapshot = (): MealSnapshot => ({
  kind: 'meal',
  id: valueOf(parseMealEntryId('meal-1')),
  scope,
  revision: valueOf(parseRevision(2)),
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_100_000,
  lifecycle: {kind: 'active'},
  syncState: {kind: 'pending', queuedAt: 1_700_000_100_000, operationCount: 1},
  mealStart: 1_700_000_000_000,
  image: {
    mimeType: 'image/jpeg',
    fileName: 'private-name.jpg',
    byteSize: 321_000,
    widthPx: 1200,
    heightPx: 900,
    syncState: {
      kind: 'available',
      localUri: 'file:///private/documents/photo.jpg',
      objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
      objectPath:
        'users/owner-1/workspaces/workspace-1/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg',
      displayUri: 'storage-object://private-display-token',
      thumbnailUri: 'storage-object://private-thumbnail-token',
    },
  },
  tags: [],
  externalLinks: [],
});

describe('remote Meal Image document contract', () => {
  it('syncs only safe object metadata and hydrates a remote-only image', () => {
    const projected = projectMealRemoteDocument(snapshot());
    expect(projected.ok).toBe(true);
    if (!projected.ok) {
      return;
    }

    expect(projected.value.image).toEqual({
      kind: 'stored',
      objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
      mimeType: 'image/jpeg',
      byteSize: 321_000,
      widthPx: 1200,
      heightPx: 900,
    });
    const serialised = JSON.stringify(projected.value);
    expect(serialised).not.toContain('file:///private');
    expect(serialised).not.toContain('private-display-token');
    expect(serialised).not.toContain('private-thumbnail-token');
    expect(serialised).not.toContain('private-name.jpg');

    const hydrated = hydrateRemoteMealDocument(
      projected.value,
      scope,
      1_700_000_200_000,
    );
    expect(hydrated.image).toEqual({
      mimeType: 'image/jpeg',
      byteSize: 321_000,
      widthPx: 1200,
      heightPx: 900,
      syncState: {
        kind: 'available',
        objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
        objectPath:
          'users/owner-1/workspaces/workspace-1/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg',
        displayUri:
          'storage-object://users%2Fowner-1%2Fworkspaces%2Fworkspace-1%2FmealImages%2Fmeal-1%2Fimage_1234567890abcdef1234567890abcdef.jpg',
        thumbnailUri:
          'storage-object://users%2Fowner-1%2Fworkspaces%2Fworkspace-1%2FmealImages%2Fmeal-1%2Fimage_1234567890abcdef1234567890abcdef.jpg',
      },
    });
  });

  it('rejects unsafe names, unknown metadata and local URI leaks', () => {
    const projected = projectMealRemoteDocument(snapshot());
    if (!projected.ok) {
      throw new Error('Projection failed.');
    }
    expect(
      decodeRemoteMealDocument({
        ...projected.value,
        image: {...projected.value.image, objectName: '../escape.jpg'},
      }).ok,
    ).toBe(false);
    expect(
      decodeRemoteMealDocument({
        ...projected.value,
        image: {...projected.value.image, localUri: 'file:///private.jpg'},
      }).ok,
    ).toBe(false);
  });
});
