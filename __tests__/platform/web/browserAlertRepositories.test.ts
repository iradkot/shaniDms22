import {
  createBrowserAlertRulesRepository,
  createBrowserUpdateCenterRepository,
} from '../../../src/platform/web';

class MemoryStorage {
  readonly values = new Map<string, string>();
  async getItem(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }
}

describe('browser alert repositories', () => {
  it('persists complete validated alert rule management', async () => {
    const storage = new MemoryStorage();
    const first = createBrowserAlertRulesRepository({
      storage,
      scopeId: 'user-workspace',
      createId: () => 'rule-1',
    });
    await first.refresh();
    await first.add({
      name: 'Overnight range',
      enabled: true,
      lowerBoundMgDl: 70,
      upperBoundMgDl: 180,
      activeFromMinute: 22 * 60,
      activeToMinute: 7 * 60,
      trend: 'any',
    });

    const reopened = createBrowserAlertRulesRepository({
      storage,
      scopeId: 'user-workspace',
    });
    await reopened.refresh();
    expect(reopened.getSnapshot()).toMatchObject({
      status: 'ready',
      rules: [{id: 'rule-1', name: 'Overnight range'}],
    });
    await reopened.setEnabled('rule-1', false);
    expect(reopened.getSnapshot()).toMatchObject({
      rules: [{enabled: false}],
    });
  });

  it('opens an empty durable Update Center without fabricating alerts', async () => {
    const repository = createBrowserUpdateCenterRepository({
      storage: new MemoryStorage(),
      scopeId: 'user-workspace',
    });
    await repository.refresh();
    expect(repository.getSnapshot()).toEqual({status: 'ready', items: []});
  });
});
