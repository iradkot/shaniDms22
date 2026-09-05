import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createNativeAlertRulesRepository,
  createNativeUpdateCenterRepository,
} from 'app/platform/native/alerts/localNotificationRepositories';
import {markNotificationRuleCalled} from 'app/services/notifications/localNotificationsStore';

describe('native local alert repositories', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('round-trips rule management through the existing local notification store', async () => {
    const repository = createNativeAlertRulesRepository();
    await repository.refresh();
    const created = await repository.add({
      name: 'Night range',
      enabled: true,
      lowerBoundMgDl: 70,
      upperBoundMgDl: 180,
      activeFromMinute: 22 * 60,
      activeToMinute: 6 * 60,
      trend: 'single-down',
    });

    expect(created.id).toMatch(/^rule_/);
    expect(repository.getSnapshot()).toEqual({
      status: 'ready',
      rules: [
        expect.objectContaining({
          name: 'Night range',
          activeFromMinute: 1320,
          activeToMinute: 360,
          trend: 'single-down',
        }),
      ],
    });

    await repository.setEnabled(created.id, false);
    expect(repository.getSnapshot()).toEqual({
      status: 'ready',
      rules: [expect.objectContaining({enabled: false})],
    });
  });

  it('labels only newly observed legacy triggers unread and persists an explicit read action', async () => {
    const rules = createNativeAlertRulesRepository();
    const updates = createNativeUpdateCenterRepository({
      createId: () => 'update-1',
    });
    await rules.refresh();
    const rule = await rules.add({
      name: 'Low glucose',
      enabled: true,
      lowerBoundMgDl: 70,
      upperBoundMgDl: 180,
      activeFromMinute: 0,
      activeToMinute: 1439,
      trend: 'any',
    });
    await updates.refresh();

    await markNotificationRuleCalled(rule.id, 2_000);
    await updates.refresh();
    const ready = updates.getSnapshot();
    expect(ready.status).toBe('ready');
    if (ready.status !== 'ready') {
      throw new Error('Expected ready updates');
    }
    expect(ready.items[0]).toEqual(
      expect.objectContaining({
        occurredAtMs: 2_000,
        readState: 'unread',
        content: {kind: 'alert-rule-trigger', ruleName: 'Low glucose'},
      }),
    );

    await updates.markRead(ready.items[0]!.id);
    const reloaded = createNativeUpdateCenterRepository();
    await reloaded.refresh();
    expect(reloaded.getSnapshot()).toEqual({
      status: 'ready',
      items: [expect.objectContaining({readState: 'read'})],
    });
  });

  it('stores first-class app reminders locally with typed links', async () => {
    const updates = createNativeUpdateCenterRepository({
      createId: () => 'reminder-1',
    });
    await updates.refresh();
    const created = await updates.append({
      kind: 'reminder',
      occurredAtMs: 3_000,
      content: {
        kind: 'message',
        title: 'Review yesterday',
        body: 'Your previous-day summary is ready.',
      },
      deepLink: {kind: 'day', dayStartMs: 1_000},
    });

    expect(created).toEqual(
      expect.objectContaining({id: 'reminder-1', readState: 'unread'}),
    );
    const reloaded = createNativeUpdateCenterRepository();
    await reloaded.refresh();
    expect(reloaded.getSnapshot()).toEqual({
      status: 'ready',
      items: [
        expect.objectContaining({
          id: 'reminder-1',
          deepLink: {kind: 'day', dayStartMs: 1_000},
        }),
      ],
    });
  });

  it('retains an immutable rule and observation snapshot for each alert occurrence', async () => {
    const updates = createNativeUpdateCenterRepository({
      createId: () => 'occurrence-1',
      scopeId: 'workspace_alpha',
    });
    const created = await updates.append({
      kind: 'alert',
      occurredAtMs: 4_000,
      content: {
        kind: 'alert-rule-occurrence',
        rule: {
          id: 'rule-1',
          name: 'Night low',
          lowerBoundMgDl: 70,
          upperBoundMgDl: 180,
          activeFromMinute: 1_320,
          activeToMinute: 360,
          trend: 'single-down',
        },
        observation: {valueMgDl: 64, trend: 'single-down'},
      },
    });

    expect(created).toEqual(
      expect.objectContaining({
        id: 'occurrence-1',
        deepLink: {
          kind: 'alert-occurrence',
          occurrenceId: 'occurrence-1',
        },
      }),
    );

    const reloaded = createNativeUpdateCenterRepository({
      scopeId: 'workspace_alpha',
    });
    await reloaded.refresh();
    expect(reloaded.getSnapshot()).toEqual({
      status: 'ready',
      items: [
        expect.objectContaining({
          id: 'occurrence-1',
          content: expect.objectContaining({
            kind: 'alert-rule-occurrence',
            observation: {valueMgDl: 64, trend: 'single-down'},
          }),
        }),
      ],
    });
  });

  it('keeps rules and update history isolated by opaque Workspace scope', async () => {
    const alphaRules = createNativeAlertRulesRepository({
      scopeId: 'workspace_alpha',
    });
    const betaRules = createNativeAlertRulesRepository({
      scopeId: 'workspace_beta',
    });
    const alphaUpdates = createNativeUpdateCenterRepository({
      scopeId: 'workspace_alpha',
      createId: () => 'alpha-reminder',
    });
    const betaUpdates = createNativeUpdateCenterRepository({
      scopeId: 'workspace_beta',
    });

    await alphaRules.add({
      name: 'Alpha only',
      enabled: true,
      lowerBoundMgDl: 70,
      upperBoundMgDl: 180,
      activeFromMinute: 0,
      activeToMinute: 1439,
      trend: 'any',
    });
    await alphaUpdates.append({
      kind: 'reminder',
      occurredAtMs: 5_000,
      content: {kind: 'message', title: 'Alpha reminder'},
    });
    await Promise.all([betaRules.refresh(), betaUpdates.refresh()]);

    expect(betaRules.getSnapshot()).toEqual({status: 'ready', rules: []});
    expect(betaUpdates.getSnapshot()).toEqual({status: 'ready', items: []});
    expect(alphaRules.getSnapshot()).toEqual({
      status: 'ready',
      rules: [expect.objectContaining({name: 'Alpha only'})],
    });
    expect(alphaUpdates.getSnapshot()).toEqual({
      status: 'ready',
      items: [expect.objectContaining({id: 'alpha-reminder'})],
    });
  });
});
