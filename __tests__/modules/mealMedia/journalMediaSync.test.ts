import {
  InMemoryJournalLocalStore,
  createJournalEngine,
  journalRemoteOk,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
  type JournalClock,
  type JournalIdGenerator,
  type JournalMediaStore,
  type JournalRemoteAdapter,
  type JournalWorkspaceScope,
  type MealImageSnapshot,
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
const clock: JournalClock = {now: () => 1_700_000_000_000};
const ids: JournalIdGenerator = {
  nextEntryId: () => 'meal-1',
  nextOperationId: () => 'operation-1',
};

const pendingImage: MealImageSnapshot = {
  mimeType: 'image/jpeg',
  byteSize: 500,
  syncState: {
    kind: 'upload_pending',
    localUri: 'file:///documents/image.jpg',
    objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
  },
};

const availableImage: MealImageSnapshot = {
  ...pendingImage,
  syncState: {
    kind: 'available',
    localUri: 'file:///documents/image.jpg',
    objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
    objectPath:
      'users/owner-1/workspaces/workspace-1/mealImages/meal-1/image_1234567890abcdef1234567890abcdef.jpg',
    displayUri: 'storage-object://display',
    thumbnailUri: 'storage-object://thumbnail',
  },
};

describe('Journal Meal Image synchronisation', () => {
  it('prepares an image before uploading its Journal operation', async () => {
    const prepared: string[] = [];
    const pushedImages: unknown[] = [];
    const mediaStore: JournalMediaStore = {
      async stageMealImage() {
        return pendingImage;
      },
      async removeMealImage() {},
      async prepareMealImageForRemote(_scope, mealId) {
        prepared.push(mealId);
        return {ok: true, value: availableImage};
      },
    };
    const remote: JournalRemoteAdapter = {
      async push({change}) {
        pushedImages.push(
          change.changeKind === 'upsert' &&
            change.document.documentKind === 'meal'
            ? change.document.image
            : undefined,
        );
        return journalRemoteOk({
          kind: 'acknowledged',
          operationId: change.operationId,
          acceptedRevision: change.localRevision,
        });
      },
      async pull() {
        return journalRemoteOk({changes: []});
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock,
      ids,
      mediaStore,
      remoteAdapter: remote,
    }).open(scope);
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    const captured = await opened.value.meals.capture({
      mealStart: clock.now(),
      image: {uri: 'picker://image', mimeType: 'image/jpeg'},
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }

    await expect(opened.value.sync.synchronize()).resolves.toEqual({
      ok: true,
      value: {pushed: 1, pulled: 0},
    });
    expect(prepared).toEqual(['meal-1']);
    expect(pushedImages).toEqual([
      {
        kind: 'stored',
        objectName: 'image_1234567890abcdef1234567890abcdef.jpg',
        mimeType: 'image/jpeg',
        byteSize: 500,
      },
    ]);
    expect(opened.value.meals.getSnapshot(captured.value.id)?.image).toEqual(
      availableImage,
    );
  });

  it('keeps the durable outbox when image upload is temporarily offline', async () => {
    let remotePushes = 0;
    const mediaStore: JournalMediaStore = {
      async stageMealImage() {
        return pendingImage;
      },
      async removeMealImage() {},
      async prepareMealImageForRemote() {
        return {
          ok: false,
          error: {message: 'Image upload is offline.', retryable: true},
        };
      },
    };
    const remote: JournalRemoteAdapter = {
      async push({change}) {
        remotePushes += 1;
        return journalRemoteOk({
          kind: 'acknowledged',
          operationId: change.operationId,
          acceptedRevision: change.localRevision,
        });
      },
      async pull() {
        return journalRemoteOk({changes: []});
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock,
      ids,
      mediaStore,
      remoteAdapter: remote,
    }).open(scope);
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    await opened.value.meals.capture({
      mealStart: clock.now(),
      image: {uri: 'picker://image', mimeType: 'image/jpeg'},
    });

    await expect(opened.value.sync.synchronize()).resolves.toMatchObject({
      ok: false,
      error: {
        kind: 'offline',
        message: 'Image upload is offline.',
        retryable: true,
      },
    });
    expect(remotePushes).toBe(0);
    expect(opened.value.outbox.getSnapshot()).toHaveLength(1);
  });

  it('does not replace a newer local image when an older upload finishes', async () => {
    const replacementImage: MealImageSnapshot = {
      mimeType: 'image/png',
      byteSize: 700,
      syncState: {
        kind: 'upload_pending',
        localUri: 'file:///documents/replacement.png',
        objectName: 'image_abcdef1234567890abcdef1234567890.png',
      },
    };
    let uploadStarted!: () => void;
    const started = new Promise<void>(resolve => {
      uploadStarted = resolve;
    });
    let finishUpload!: () => void;
    const finished = new Promise<void>(resolve => {
      finishUpload = resolve;
    });
    let operationSequence = 0;
    const raceIds: JournalIdGenerator = {
      nextEntryId: () => 'meal-1',
      nextOperationId: () => {
        operationSequence += 1;
        return `operation-${operationSequence}`;
      },
    };
    const mediaStore: JournalMediaStore = {
      async stageMealImage(_scope, _mealId, input) {
        return input.uri.includes('replacement')
          ? replacementImage
          : pendingImage;
      },
      async removeMealImage() {},
      async prepareMealImageForRemote() {
        uploadStarted();
        await finished;
        return {ok: true, value: availableImage};
      },
    };
    const remote: JournalRemoteAdapter = {
      async push({change}) {
        return journalRemoteOk({
          kind: 'acknowledged',
          operationId: change.operationId,
          acceptedRevision: change.localRevision,
        });
      },
      async pull() {
        return journalRemoteOk({changes: []});
      },
    };
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock,
      ids: raceIds,
      mediaStore,
      remoteAdapter: remote,
    }).open(scope);
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }
    const captured = await opened.value.meals.capture({
      mealStart: clock.now(),
      image: {uri: 'picker://initial', mimeType: 'image/jpeg'},
    });
    if (!captured.ok) {
      throw new Error(captured.error.message);
    }

    const synchronizing = opened.value.sync.synchronize();
    await started;
    const revised = await opened.value.meals.revise({
      mealId: captured.value.id,
      expectedRevision: captured.value.revision,
      image: {
        kind: 'set',
        value: {uri: 'picker://replacement', mimeType: 'image/png'},
      },
    });
    if (!revised.ok) {
      throw new Error(revised.error.message);
    }
    finishUpload();
    await synchronizing;

    expect(opened.value.meals.getSnapshot(captured.value.id)?.image).toEqual(
      replacementImage,
    );
    expect(opened.value.outbox.getSnapshot()).toHaveLength(1);
  });
});
