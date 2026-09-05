import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  addMemoryEntry,
  approveMemoryEntry,
  clearAllMemory,
  deleteMemoryEntry,
  getMemoryByIds,
  getMemoryStats,
  getMemoryTree,
  listMemoryEntries,
  loadProfileSnapshot,
  markEpisodeKeyIfNew,
  proposeMemoryEntry,
  searchMemory,
  updateMemoryEntry,
  upsertProfileSnapshot,
} from 'app/services/aiMemory/aiMemoryStore';
import {
  deriveWorkspaceIdentity,
  sha1WorkspaceIdentityDigest,
} from 'app/modules/workspaces';
import {aiWorkspaceStorageKey} from 'app/services/aiMemory/aiWorkspaceScope';

const scopeFor = (nightscoutBaseUrl: string) => {
  const identity = deriveWorkspaceIdentity(
    {firebaseUserId: 'product-user-1', nightscoutBaseUrl},
    sha1WorkspaceIdentityDigest,
  );
  if (!identity.ok) {
    throw new Error(identity.reason);
  }
  return {
    productUserId: identity.value.scope.productUserId,
    workspaceId: identity.value.scope.workspaceId,
  };
};

describe('AI memory Workspace isolation', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('returns relevant memory only inside the Workspace that owns it', async () => {
    const firstWorkspace = scopeFor('https://first.example.com');
    const secondWorkspace = scopeFor('https://second.example.com');

    await addMemoryEntry(firstWorkspace, {
      type: 'episode',
      tags: ['meal'],
      textSummary: 'Private lentil dinner response',
      source: 'user',
    });

    expect(await searchMemory(secondWorkspace, 'lentil dinner')).toEqual([]);
    expect(await searchMemory(firstWorkspace, 'lentil dinner')).toEqual([
      expect.objectContaining({textSummary: 'Private lentil dinner response'}),
    ]);
  });

  it('does not expose the AI profile snapshot in another Workspace', async () => {
    const firstWorkspace = scopeFor('https://first.example.com');
    const secondWorkspace = scopeFor('https://second.example.com');

    await upsertProfileSnapshot(firstWorkspace, {
      communicationStyle: 'Prefer concise explanations',
      notes: ['Private first Workspace note'],
    });

    expect(await loadProfileSnapshot(secondWorkspace)).toBeNull();
    expect(await loadProfileSnapshot(firstWorkspace)).toEqual(
      expect.objectContaining({
        communicationStyle: 'Prefer concise explanations',
        notes: ['Private first Workspace note'],
      }),
    );
  });

  it('deduplicates generated episodes independently per Workspace', async () => {
    const firstWorkspace = scopeFor('https://first.example.com');
    const secondWorkspace = scopeFor('https://second.example.com');

    expect(await markEpisodeKeyIfNew(firstWorkspace, 'meal:2026-08-30')).toBe(
      true,
    );
    expect(await markEpisodeKeyIfNew(secondWorkspace, 'meal:2026-08-30')).toBe(
      true,
    );
    expect(await markEpisodeKeyIfNew(firstWorkspace, 'meal:2026-08-30')).toBe(
      false,
    );
  });

  it('clears only the selected Workspace memory', async () => {
    const firstWorkspace = scopeFor('https://first.example.com');
    const secondWorkspace = scopeFor('https://second.example.com');
    const memory = {
      type: 'chat_summary' as const,
      tags: ['feedback'],
      textSummary: 'Keep this Workspace feedback',
      source: 'user' as const,
    };

    await addMemoryEntry(firstWorkspace, memory);
    await addMemoryEntry(secondWorkspace, memory);
    await upsertProfileSnapshot(firstWorkspace, {notes: ['first']});
    await upsertProfileSnapshot(secondWorkspace, {notes: ['second']});

    await clearAllMemory(firstWorkspace);

    expect(await getMemoryStats(firstWorkspace)).toEqual(
      expect.objectContaining({total: 0}),
    );
    expect(await loadProfileSnapshot(firstWorkspace)).toBeNull();
    expect(await getMemoryStats(secondWorkspace)).toEqual(
      expect.objectContaining({total: 1}),
    );
    expect(await loadProfileSnapshot(secondWorkspace)).toEqual(
      expect.objectContaining({notes: ['second']}),
    );
  });

  it('purges legacy memory that has no Workspace owner', async () => {
    const activeWorkspace = scopeFor('https://first.example.com');
    await AsyncStorage.multiSet([
      ['aiMemory:v1:entries', JSON.stringify([{textSummary: 'legacy'}])],
      ['aiMemory:v1:profile', JSON.stringify({notes: ['legacy']})],
      ['aiMemory:v1:episodeKeys', JSON.stringify(['legacy-key'])],
    ]);

    await clearAllMemory(activeWorkspace);

    expect(
      await AsyncStorage.multiGet([
        'aiMemory:v1:entries',
        'aiMemory:v1:profile',
        'aiMemory:v1:episodeKeys',
      ]),
    ).toEqual([
      ['aiMemory:v1:entries', null],
      ['aiMemory:v1:profile', null],
      ['aiMemory:v1:episodeKeys', null],
    ]);
  });

  it('rejects a raw Nightscout URL as a storage-key namespace', () => {
    const activeWorkspace = scopeFor('https://private-nightscout.example.com');

    expect(() =>
      aiWorkspaceStorageKey(
        'https://private-nightscout.example.com',
        activeWorkspace,
      ),
    ).toThrow('AI storage namespace is invalid');
  });

  it('keeps suggestions, approvals and folder counts inside their owning Workspace', async () => {
    const owner = scopeFor('https://first.example.com');
    const other = scopeFor('https://second.example.com');
    const suggestion = await proposeMemoryEntry(owner, {
      type: 'episode',
      tags: ['meal'],
      textSummary: 'Private lentil dinner response',
      folder: {category: 'daily_patterns', path: ['meals']},
      retention: {detailLevel: 'normal', rememberUntil: Date.now() + 60_000},
    });
    expect(suggestion).not.toBeNull();
    const id = suggestion!.id;

    expect(await searchMemory(owner, 'lentil')).toEqual([]);
    expect(await listMemoryEntries(other)).toEqual([]);
    expect(await getMemoryByIds(other, [id])).toEqual([]);
    expect(await approveMemoryEntry(other, id)).toBeNull();
    expect(
      await updateMemoryEntry(other, id, {textSummary: 'wrong owner'}),
    ).toBeNull();
    expect(await deleteMemoryEntry(other, id)).toBe(false);
    expect(
      (await getMemoryTree(other)).every(folder => folder.count === 0),
    ).toBe(true);

    const approved = await approveMemoryEntry(owner, id);
    expect(approved?.tags).toContain('user_approved');
    expect(approved?.tags).not.toContain('disabled_for_ai');
    expect(approved?.retention).toEqual(suggestion?.retention);
    expect(await searchMemory(owner, 'lentil')).toEqual([
      expect.objectContaining({
        id,
        textSummary: 'Private lentil dinner response',
      }),
    ]);
    expect(await getMemoryTree(owner)).toContainEqual({
      key: 'daily_patterns/meals',
      count: 1,
    });
    expect(await deleteMemoryEntry(owner, id)).toBe(true);
    expect(await listMemoryEntries(owner)).toEqual([]);
  });

  it('applies upstream retention when listing scoped memory', async () => {
    const owner = scopeFor('https://first.example.com');
    await addMemoryEntry(owner, {
      type: 'episode',
      tags: [],
      textSummary: 'Expired memory',
      retention: {detailLevel: 'normal', rememberUntil: Date.now() - 1},
    });
    expect(await listMemoryEntries(owner)).toEqual([]);
  });
});
