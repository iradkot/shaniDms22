import {
  CORE_DESTINATION_IDS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from '../../../src/product/destinations';
import {
  createBrowserJournalEngine,
  createWebDestinationRuntime,
  getOrCreateBrowserWorkspaceScope,
} from '../../../src/platform/web';

class MemoryKeyValueStore {
  readonly values = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async updateItem<TResult>(
    key: string,
    update: (current: string | null) => {
      readonly value?: string;
      readonly result: TResult;
    },
  ): Promise<TResult> {
    const next = update(this.values.get(key) ?? null);
    if (next.value !== undefined) {
      this.values.set(key, next.value);
    }
    return next.result;
  }
}

class MemorySynchronousStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe('web platform boundary', () => {
  it('opts in Product modules backed by real browser adapters', () => {
    const runtime = createWebDestinationRuntime({
      authenticated: true,
      nightscout: true,
      ai: true,
    });
    const meals = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.meals),
      undefined,
      runtime,
    );
    const activity = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.activity),
      undefined,
      runtime,
    );
    const graph = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph),
      undefined,
      runtime,
    );
    const hypo = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.hypoInvestigation),
      undefined,
      runtime,
    );

    expect(meals.status).toBe('available');
    expect(activity.status).toBe('available');
    expect(graph.status).toBe('available');
    expect(hypo.status).toBe('available');
  });

  it('keeps connection-dependent destinations visible but disabled', () => {
    const runtime = createWebDestinationRuntime({locale: 'he'});
    const graph = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph),
      undefined,
      runtime,
    );
    const ai = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst),
      undefined,
      runtime,
    );
    const similarEvents = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.similarEvents),
      undefined,
      runtime,
    );

    expect(graph).toMatchObject({
      status: 'unavailable',
      reason: {code: 'disabled', message: 'נדרש חיבור ל־Nightscout.'},
    });
    expect(ai).toMatchObject({
      status: 'unavailable',
      reason: {code: 'disabled', message: 'יש להתחבר לחשבון כדי להשתמש ב־AI.'},
    });
    expect(similarEvents).toMatchObject({
      status: 'unavailable',
      reason: {code: 'disabled', message: 'נדרש חיבור ל־Nightscout.'},
    });
  });

  it('persists an opaque local Workspace identity without personal fields', () => {
    const storage = new MemorySynchronousStorage();
    const first = getOrCreateBrowserWorkspaceScope(
      storage,
      () => 'opaque-browser-id-1234',
    );
    const second = getOrCreateBrowserWorkspaceScope(
      storage,
      () => 'different-browser-id',
    );

    expect(second).toEqual(first);
    expect(JSON.stringify([...storage.values.values()])).not.toMatch(
      /email|nightscoutUrl|apiKey/i,
    );
  });

  it('reopens locally committed Journal data without a remote adapter', async () => {
    const storage = new MemoryKeyValueStore();
    const scope = getOrCreateBrowserWorkspaceScope(
      new MemorySynchronousStorage(),
      () => 'opaque-browser-id-5678',
    );
    const firstOpen = await createBrowserJournalEngine(storage).open(scope);
    expect(firstOpen.ok).toBe(true);
    if (!firstOpen.ok) {
      return;
    }

    const captured = await firstOpen.value.meals.capture({
      mealStart: 1_700_000_000_000,
      name: 'Offline web meal',
      mealCarbohydrates: {kind: 'meal_carbohydrates', grams: 35},
    });
    expect(captured.ok).toBe(true);
    expect(firstOpen.value.sync.getSnapshot()).toEqual({
      kind: 'disabled',
      reason: 'remote_adapter_unavailable',
    });

    const reopened = await createBrowserJournalEngine(storage).open(scope);
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) {
      return;
    }
    expect(reopened.value.meals.getListSnapshot().items).toHaveLength(1);
    expect(reopened.value.outbox.getSnapshot()).toHaveLength(1);
  });
});
