import notifee from '@notifee/react-native';
import {
  cancelPreMealNotification,
  syncPreMealNotification,
} from 'app/services/proactiveCare/preMealNotifications';

describe('pre-meal notification delivery', () => {
  beforeEach(() => jest.clearAllMocks());

  it('requires both explicit intent and notification opt-in', async () => {
    await syncPreMealNotification({
      scopeId: 'workspace_a',
      locale: 'en',
      enabled: false,
      intent: {startedAtMs: 1_000_000, expiresAtMs: 6_400_000},
      nowMs: 1_000_000,
    });
    expect(notifee.createTriggerNotification).not.toHaveBeenCalled();
  });

  it('schedules factual copy ten minutes after intent and scopes its route', async () => {
    await syncPreMealNotification({
      scopeId: 'workspace_a',
      locale: 'he',
      enabled: true,
      intent: {startedAtMs: 1_000_000, expiresAtMs: 6_400_000},
      nowMs: 1_000_000,
    });

    expect(notifee.createTriggerNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          destinationId: 'core.day-graph',
          workspaceScopeId: 'workspace_a',
        }),
      }),
      expect.objectContaining({timestamp: 1_600_000}),
    );
    const notification = (notifee.createTriggerNotification as jest.Mock).mock
      .calls[0][0];
    expect(`${notification.title} ${notification.body}`).not.toMatch(
      /dose|bolus|יח[׳']|מינון/i,
    );
  });

  it('uses different notification IDs for different Workspaces', async () => {
    await cancelPreMealNotification('workspace_a');
    const first = (notifee.cancelNotification as jest.Mock).mock.calls[0][0];
    jest.clearAllMocks();
    await cancelPreMealNotification('workspace_b');
    const second = (notifee.cancelNotification as jest.Mock).mock.calls[0][0];
    expect(first).not.toBe(second);
  });
});
