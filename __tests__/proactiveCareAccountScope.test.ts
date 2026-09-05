import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';

import {
  clearHypoNowNotifications,
  evaluateHypoNowAndNotify,
} from 'app/services/proactiveCare/hypoNowMvp';
import {getLatestDailyBrief} from 'app/services/proactiveCare/dailyBrief';

const lowSample = (date: number) =>
  ({sgv: 60, date, direction: 'Flat'} as never);

describe('proactive-care account scope', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('keeps hypo cooldown and duplicate markers separate by Workspace', async () => {
    const nowMs = 1_700_000_000_000;
    const first = await evaluateHypoNowAndNotify({
      scopeId: 'workspace_a',
      latestBgSample: lowSample(nowMs),
      nowMs,
    });
    const duplicateA = await evaluateHypoNowAndNotify({
      scopeId: 'workspace_a',
      latestBgSample: lowSample(nowMs),
      nowMs: nowMs + 1_000,
    });
    const firstForB = await evaluateHypoNowAndNotify({
      scopeId: 'workspace_b',
      latestBgSample: lowSample(nowMs),
      nowMs: nowMs + 1_000,
    });

    expect(first.reason).toBe('notify_hypo_now');
    expect(duplicateA.reason).toBe('duplicate_bg');
    expect(firstForB.reason).toBe('notify_hypo_now');
    const keys = await AsyncStorage.getAllKeys();
    expect(keys).toEqual(
      expect.arrayContaining([
        expect.stringContaining(':workspace_a'),
        expect.stringContaining(':workspace_b'),
      ]),
    );
    expect(keys.some(key => key.endsWith('lastTriggeredAtMs'))).toBe(false);
  });

  it('cancels only the Workspace notification IDs being left', async () => {
    await clearHypoNowNotifications('workspace_a');
    const accountAIds = (notifee.cancelNotification as jest.Mock).mock.calls.map(
      call => call[0],
    );
    jest.clearAllMocks();
    await clearHypoNowNotifications('workspace_b');
    const accountBIds = (notifee.cancelNotification as jest.Mock).mock.calls.map(
      call => call[0],
    );

    expect(accountAIds).toHaveLength(2);
    expect(accountBIds).toHaveLength(2);
    expect(accountAIds).not.toEqual(accountBIds);
  });

  it('reads a daily brief only from the requested Workspace', async () => {
    await AsyncStorage.setItem(
      'proactiveCare:dailyBrief:latestBrief:workspace_a',
      JSON.stringify({
        title: 'A title',
        body: 'A private body',
        source: 'fallback',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    );
    await AsyncStorage.setItem(
      'proactiveCare:dailyBrief:latestBrief',
      JSON.stringify({
        title: 'Legacy title',
        body: 'Legacy private body',
        source: 'fallback',
        createdAt: '2025-01-01T00:00:00.000Z',
      }),
    );

    await expect(getLatestDailyBrief('workspace_a')).resolves.toMatchObject({
      body: 'A private body',
    });
    await expect(getLatestDailyBrief('workspace_b')).resolves.toBeNull();
    await expect(getLatestDailyBrief(undefined)).resolves.toBeNull();
  });
});
