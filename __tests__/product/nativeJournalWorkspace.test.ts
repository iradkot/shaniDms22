import {
  JOURNAL_ERROR_CODES,
  journalError,
  journalOk,
} from '../../src/modules/journal';
import type {
  JournalEngine,
  JournalWorkspace,
  JournalWorkspaceScope,
} from '../../src/modules/journal';
import {openJournalWorkspaceWithMaintenance} from '../../src/platform/native/journal/useNativeJournalWorkspace';

const scope = {
  productUserId: 'user-1',
  workspaceId: 'workspace-1',
  nightscoutSourceId: 'nightscout-1',
} as JournalWorkspaceScope;

describe('native Journal opening maintenance', () => {
  it('attempts retention maintenance before returning an opened Workspace', async () => {
    const purgeExpiredTrash = jest
      .fn()
      .mockResolvedValue(journalOk({tombstones: [], mediaCleanupFailures: []}));
    const workspace = {
      maintenance: {purgeExpiredTrash},
    } as unknown as JournalWorkspace;
    const engine: JournalEngine = {
      open: jest.fn().mockResolvedValue(journalOk(workspace)),
    };

    const result = await openJournalWorkspaceWithMaintenance(engine, scope);

    expect(result).toEqual(journalOk(workspace));
    expect(purgeExpiredTrash).toHaveBeenCalledTimes(1);
  });

  it('keeps the local Workspace usable when best-effort cleanup fails', async () => {
    const purgeExpiredTrash = jest.fn().mockRejectedValue(new Error('disk'));
    const workspace = {
      maintenance: {purgeExpiredTrash},
    } as unknown as JournalWorkspace;
    const engine: JournalEngine = {
      open: jest.fn().mockResolvedValue(journalOk(workspace)),
    };

    await expect(
      openJournalWorkspaceWithMaintenance(engine, scope),
    ).resolves.toEqual(journalOk(workspace));
  });

  it('does not run maintenance when the Workspace could not be opened', async () => {
    const engine: JournalEngine = {
      open: jest.fn().mockResolvedValue(
        journalError({
          code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE,
          message: 'offline storage unavailable',
          retryable: true,
        }),
      ),
    };

    await expect(
      openJournalWorkspaceWithMaintenance(engine, scope),
    ).resolves.toMatchObject({
      ok: false,
      error: {code: JOURNAL_ERROR_CODES.STORAGE_UNAVAILABLE},
    });
  });
});
