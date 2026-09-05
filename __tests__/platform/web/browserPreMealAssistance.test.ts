import {
  createAuthenticatedBrowserWorkspaceScope,
  createBrowserPreMealAssistanceController,
  type IndexedDbItemUpdate,
} from '../../../src/platform/web';

class MemoryStorage {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.values.delete(key);
  }

  async getAllKeys(): Promise<readonly string[]> {
    return [...this.values.keys()];
  }

  async updateItem<T>(
    key: string,
    update: (current: string | null) => IndexedDbItemUpdate<T>,
  ): Promise<T> {
    const result = update(this.values.get(key) ?? null);
    if (result.value !== undefined) {
      this.values.set(key, result.value);
    }
    return result.result;
  }
}

const scope = createAuthenticatedBrowserWorkspaceScope({
  uid: 'user-1',
  workspaceId: 'primary',
  nightscoutSourceId: 'source-1',
});

describe('browser pre-meal assistance', () => {
  it('persists opt-in settings and a time-limited intent offline-first', async () => {
    const nowMs = 1_800_000_000_000;
    const storage = new MemoryStorage();
    const controller = createBrowserPreMealAssistanceController({
      storage,
      scope,
      now: () => nowMs,
    });
    await controller.initialize();
    expect(controller.getSnapshot()).toEqual({
      settings: {enabled: false, notificationsEnabled: false},
    });

    await controller.setSettings({enabled: true, notificationsEnabled: true});
    await controller.startIntent();
    expect(controller.getSnapshot()).toMatchObject({
      settings: {enabled: true, notificationsEnabled: true},
      intent: {
        startedAtMs: nowMs,
        expiresAtMs: nowMs + 90 * 60 * 1_000,
      },
    });

    const reopened = createBrowserPreMealAssistanceController({
      storage,
      scope,
      now: () => nowMs + 1_000,
    });
    await reopened.initialize();
    expect(reopened.getSnapshot()).toEqual(controller.getSnapshot());

    const expired = createBrowserPreMealAssistanceController({
      storage,
      scope,
      now: () => nowMs + 91 * 60 * 1_000,
    });
    await expired.initialize();
    expect(expired.getSnapshot()).toEqual({
      settings: {enabled: true, notificationsEnabled: true},
    });
  });

  it('returns only current Nightscout glucose facts and reports stale cache as offline', async () => {
    const nowMs = 1_800_000_000_000;
    const controller = createBrowserPreMealAssistanceController({
      storage: new MemoryStorage(),
      scope,
      now: () => nowMs,
      client: {
        readEntries: jest.fn().mockResolvedValue({
          records: [
            {
              date: nowMs - 4 * 60 * 1_000,
              sgv: 104,
              direction: 'FortyFiveUp',
            },
          ],
          freshness: {kind: 'stale', fetchedAtMs: nowMs - 60_000},
        }),
      },
    });
    await controller.initialize();
    await controller.startIntent();

    await expect(
      controller.dataSource.loadContext({
        nowMs,
        period: {dayStartMs: nowMs - 12 * 60 * 60 * 1_000, dayEndMs: nowMs + 1},
      }),
    ).resolves.toEqual({
      relevance: {
        kind: 'active',
        startedAtMs: nowMs,
        expiresAtMs: nowMs + 90 * 60 * 1_000,
      },
      sourceState: {kind: 'offline'},
      facts: {
        observedAtMs: nowMs - 4 * 60 * 1_000,
        glucoseMgDl: 104,
        trend: 'forty-five-up',
      },
    });
  });

  it('isolates device settings by Product User and Workspace', async () => {
    const storage = new MemoryStorage();
    const primary = createBrowserPreMealAssistanceController({storage, scope});
    await primary.initialize();
    await primary.setSettings({enabled: true, notificationsEnabled: false});
    const secondary = createBrowserPreMealAssistanceController({
      storage,
      scope: createAuthenticatedBrowserWorkspaceScope({
        uid: 'user-1',
        workspaceId: 'secondary',
        nightscoutSourceId: 'source-1',
      }),
    });
    await secondary.initialize();

    expect(secondary.getSnapshot().settings).toEqual({
      enabled: false,
      notificationsEnabled: false,
    });
  });
});
