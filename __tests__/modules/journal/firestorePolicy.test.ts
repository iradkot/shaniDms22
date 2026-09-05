import {
  AppOwnedUriJournalMediaStore,
  buildJournalFirestorePaths,
  createJournalEngine,
  InMemoryJournalLocalStore,
  evaluateJournalFirestoreScope,
  parseNightscoutSourceId,
  parseProductUserId,
  parseWorkspaceId,
} from '../../../src/modules/journal';
import {
  createNativeJournalRemoteAdapterRegistration,
  nativeJournalRemoteSyncRegistration,
} from '../../../src/platform/native/journal';
import type {
  JournalWorkspaceScope,
  ParseResult,
} from '../../../src/modules/journal';

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

describe('Journal Firestore production boundary', () => {
  it('builds only owner and Workspace scoped document paths', () => {
    expect(
      buildJournalFirestorePaths(scope(), 'meal-1', 'operation-1'),
    ).toEqual({
      entry: 'users/owner-1/workspaces/workspace-1/journalEntries/meal-1',
      operation:
        'users/owner-1/workspaces/workspace-1/journalOperations/operation-1',
    });
    expect(() =>
      buildJournalFirestorePaths(scope(), '../other-owner', 'operation-1'),
    ).toThrow('Journal Entry ID cannot be used in a Firestore path.');
  });

  it('rejects cross-owner access before any Firestore SDK call', () => {
    expect(evaluateJournalFirestoreScope('owner-1', scope())).toEqual({
      allowed: true,
    });
    expect(evaluateJournalFirestoreScope('owner-2', scope())).toEqual({
      allowed: false,
      reason: 'authenticated_owner_mismatch',
    });
  });

  it('fails closed unless the binary declares a verified rules schema', () => {
    expect(createNativeJournalRemoteAdapterRegistration().enabled).toBe(false);
    expect(nativeJournalRemoteSyncRegistration.enabled).toBe(false);
    expect(
      createNativeJournalRemoteAdapterRegistration({rulesVerified: false}),
    ).toEqual({
      enabled: false,
      reason: 'firestore_rules_not_emulator_verified',
    });
  });

  it('reports sync as disabled instead of pretending an unsynced local write is uploaded', async () => {
    let id = 0;
    const opened = await createJournalEngine({
      localStore: new InMemoryJournalLocalStore(),
      clock: {now: () => 1_700_000_000_000},
      ids: {
        nextEntryId: kind => `${kind}-${++id}`,
        nextOperationId: () => `operation-${++id}`,
      },
      mediaStore: new AppOwnedUriJournalMediaStore(),
    }).open(scope());
    if (!opened.ok) {
      throw new Error(opened.error.message);
    }

    expect(opened.value.sync.getSnapshot()).toEqual({
      kind: 'disabled',
      reason: 'remote_adapter_unavailable',
    });
    expect(await opened.value.sync.synchronize()).toEqual({
      ok: false,
      error: {
        kind: 'disabled',
        reason: 'remote_adapter_unavailable',
        retryable: false,
      },
    });
  });
});
