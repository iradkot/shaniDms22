import {
  createInMemoryAlertRulesRepository,
  createInMemoryUpdateCenterRepository,
} from 'app/modules/alerts/adapters/inMemoryRepositories';

describe('alert repositories', () => {
  it('marks an update read through the observable repository seam', async () => {
    const repository = createInMemoryUpdateCenterRepository([
      {
        id: 'update-1',
        kind: 'reminder',
        occurredAtMs: 2_000,
        readState: 'unread',
        content: {kind: 'message', title: 'Check your plan'},
      },
    ]);
    const listener = jest.fn();
    const unsubscribe = repository.subscribe(listener);

    await repository.markRead('update-1');

    expect(repository.getSnapshot()).toEqual({
      status: 'ready',
      items: [
        expect.objectContaining({id: 'update-1', readState: 'read'}),
      ],
    });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('supports rule add, edit, enable, and delete through one repository contract', async () => {
    const repository = createInMemoryAlertRulesRepository([], {
      createId: () => 'rule-1',
    });
    const created = await repository.add({
      name: 'Night range',
      enabled: true,
      lowerBoundMgDl: 70,
      upperBoundMgDl: 180,
      activeFromMinute: 22 * 60,
      activeToMinute: 6 * 60,
      trend: 'any',
    });
    expect(created.id).toBe('rule-1');

    await repository.update('rule-1', {
      ...created,
      name: 'Overnight range',
    });
    await repository.setEnabled('rule-1', false);
    expect(repository.getSnapshot()).toEqual({
      status: 'ready',
      rules: [
        expect.objectContaining({
          id: 'rule-1',
          name: 'Overnight range',
          enabled: false,
        }),
      ],
    });

    await repository.delete('rule-1');
    expect(repository.getSnapshot()).toEqual({status: 'ready', rules: []});
  });

  it('rejects invalid rules before mutating repository state', async () => {
    const repository = createInMemoryAlertRulesRepository();
    await expect(
      repository.add({
        name: 'Invalid',
        enabled: true,
        lowerBoundMgDl: 180,
        upperBoundMgDl: 70,
        activeFromMinute: 0,
        activeToMinute: 1439,
        trend: 'any',
      }),
    ).rejects.toThrow('glucose-range-order');
    expect(repository.getSnapshot()).toEqual({status: 'ready', rules: []});
  });
});
