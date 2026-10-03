import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import notifee from '@notifee/react-native';
import renderer, {act} from 'react-test-renderer';

import {useGlucoseRuleNotifications} from 'app/hooks/useGlucoseRuleNotifications';
import type {NewUpdateCenterItem} from 'app/platform/native/alerts';
import {addNotificationRule} from 'app/services/notifications/localNotificationsStore';

const mockIsRuleSnoozed = jest.fn();

jest.mock('app/services/notifications/snoozeStore', () => ({
  isRuleSnoozed: (...args: unknown[]) => mockIsRuleSnoozed(...args),
}));

const flushPromises = (): Promise<void> =>
  new Promise(resolve => setImmediate(resolve));

describe('glucose rule occurrence retention', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockIsRuleSnoozed.mockResolvedValue(false);
    await AsyncStorage.clear();
    jest.spyOn(Date, 'now').mockReturnValue(1_725_667_200_000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('records the exact immutable occurrence before delivering its notification', async () => {
    const scopeId = 'workspace_alpha';
    await addNotificationRule(
      {
        name: 'Night low',
        enabled: true,
        range_start: 70,
        range_end: 180,
        hour_from_in_minutes: 0,
        hour_to_in_minutes: 1_439,
        trend: 'SingleDown',
      },
      {scopeId},
    );
    const append = jest.fn(async (input: NewUpdateCenterItem) => ({
      ...input,
      id: 'occurrence-1',
      readState: 'unread' as const,
      deepLink: {
        kind: 'alert-occurrence' as const,
        occurrenceId: 'occurrence-1',
      },
    }));
    const Harness = () => {
      useGlucoseRuleNotifications(
        {
          enrichedBg: {
            sgv: 64,
            date: 1_725_667_190_000,
            direction: 'SingleDown',
          },
        },
        scopeId,
        {append},
      );
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness />);
      await flushPromises();
      await flushPromises();
    });

    expect(append).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'alert',
        content: expect.objectContaining({
          kind: 'alert-rule-occurrence',
          rule: expect.objectContaining({
            name: 'Night low',
            lowerBoundMgDl: 70,
            upperBoundMgDl: 180,
          }),
          observation: {valueMgDl: 64, trend: 'single-down'},
        }),
      }),
    );
    expect(notifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({occurrenceId: 'occurrence-1'}),
      }),
    );
    expect(notifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'glucose-rule-alerts-sound-v2',
        sound: 'default',
        vibration: true,
      }),
    );
    expect(notifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({ios: {sound: 'default'}}),
    );

    act(() => tree!.unmount());
  });

  it('cancels pending work when the active Workspace changes', async () => {
    await addNotificationRule(
      {
        name: 'Alpha low',
        enabled: true,
        range_start: 70,
        range_end: 180,
        hour_from_in_minutes: 0,
        hour_to_in_minutes: 1_439,
        trend: 'SingleDown',
      },
      {scopeId: 'workspace_alpha'},
    );
    let releaseSnooze!: (value: boolean) => void;
    mockIsRuleSnoozed.mockReturnValueOnce(
      new Promise(resolve => {
        releaseSnooze = resolve;
      }),
    );
    const append = jest.fn();
    const Harness = ({scopeId}: {readonly scopeId: string}) => {
      useGlucoseRuleNotifications(
        {
          enrichedBg: {
            sgv: 64,
            date: 1_725_667_190_000,
            direction: 'SingleDown',
          },
        },
        scopeId,
        {append},
      );
      return null;
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness scopeId="workspace_alpha" />);
      await flushPromises();
      await flushPromises();
    });
    expect(mockIsRuleSnoozed).toHaveBeenCalledTimes(1);

    await act(async () => {
      tree!.update(<Harness scopeId="workspace_beta" />);
      await flushPromises();
    });
    await act(async () => {
      releaseSnooze(false);
      await flushPromises();
      await flushPromises();
    });

    expect(append).not.toHaveBeenCalled();
    expect(notifee.displayNotification).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  it('does not turn a stale cached glucose sample into a new alert', async () => {
    const scopeId = 'workspace_alpha';
    await addNotificationRule(
      {
        name: 'Low glucose',
        enabled: true,
        range_start: 70,
        range_end: 180,
        hour_from_in_minutes: 0,
        hour_to_in_minutes: 1_439,
        trend: 'SingleDown',
      },
      {scopeId},
    );
    const append = jest.fn();
    const Harness = () => {
      useGlucoseRuleNotifications(
        {
          enrichedBg: {
            sgv: 64,
            date: Date.now() - 11 * 60 * 1_000,
            direction: 'SingleDown',
          },
        },
        scopeId,
        {append},
      );
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness />);
      await flushPromises();
      await flushPromises();
    });

    expect(append).not.toHaveBeenCalled();
    expect(notifee.displayNotification).not.toHaveBeenCalled();
    act(() => tree!.unmount());
  });

  it('localizes the notification controls for a Hebrew Product User', async () => {
    const scopeId = 'workspace_hebrew';
    await addNotificationRule(
      {
        name: 'סוכר נמוך',
        enabled: true,
        range_start: 70,
        range_end: 180,
        hour_from_in_minutes: 0,
        hour_to_in_minutes: 1_439,
        trend: 'SingleDown',
      },
      {scopeId},
    );
    const Harness = () => {
      useGlucoseRuleNotifications(
        {
          enrichedBg: {
            sgv: 64,
            date: Date.now() - 10_000,
            direction: 'SingleDown',
          },
        },
        scopeId,
        undefined,
        'he',
      );
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness />);
      await flushPromises();
      await flushPromises();
    });

    expect(notifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'התראת סוכר',
        android: expect.objectContaining({
          actions: expect.arrayContaining([
            expect.objectContaining({title: 'נודניק 10 דקות'}),
          ]),
        }),
      }),
    );
    act(() => tree!.unmount());
  });

  it('uses a separate silent channel when the device-local delivery mode is silent', async () => {
    const scopeId = 'workspace_silent';
    await addNotificationRule(
      {
        name: 'Silent low',
        enabled: true,
        range_start: 70,
        range_end: 180,
        hour_from_in_minutes: 0,
        hour_to_in_minutes: 1_439,
        trend: 'SingleDown',
      },
      {scopeId},
    );
    const Harness = () => {
      useGlucoseRuleNotifications(
        {
          enrichedBg: {
            sgv: 64,
            date: Date.now() - 10_000,
            direction: 'SingleDown',
          },
        },
        scopeId,
        undefined,
        'en',
        'silent',
      );
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness />);
      await flushPromises();
      await flushPromises();
    });

    expect(notifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'glucose-rule-alerts-silent-v2',
        vibration: false,
      }),
    );
    expect(notifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        android: expect.objectContaining({
          channelId: 'glucose-rule-alerts-silent-v2',
        }),
      }),
    );
    const notification = (notifee.displayNotification as jest.Mock).mock
      .calls[0]?.[0];
    expect(notification.android.sound).toBeUndefined();
    expect(notification.ios).toBeUndefined();
    act(() => tree!.unmount());
  });

  it('uses vibration without sound for the Android vibration-only mode', async () => {
    const scopeId = 'workspace_vibrate';
    await addNotificationRule(
      {
        name: 'Vibrating low',
        enabled: true,
        range_start: 70,
        range_end: 180,
        hour_from_in_minutes: 0,
        hour_to_in_minutes: 1_439,
        trend: 'SingleDown',
      },
      {scopeId},
    );
    const Harness = () => {
      useGlucoseRuleNotifications(
        {
          enrichedBg: {
            sgv: 64,
            date: Date.now() - 10_000,
            direction: 'SingleDown',
          },
        },
        scopeId,
        undefined,
        'en',
        'vibrate-only',
      );
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness />);
      await flushPromises();
      await flushPromises();
    });

    expect(notifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'glucose-rule-alerts-vibrate-v2',
        vibration: true,
        vibrationPattern: [300, 500],
      }),
    );
    const channel = (notifee.createChannel as jest.Mock).mock.calls[0]?.[0];
    expect(channel.sound).toBeUndefined();
    const notification = (notifee.displayNotification as jest.Mock).mock
      .calls[0]?.[0];
    expect(notification.android).toEqual(
      expect.objectContaining({channelId: 'glucose-rule-alerts-vibrate-v2'}),
    );
    expect(notification.android.sound).toBeUndefined();
    expect(notification.ios).toBeUndefined();
    act(() => tree!.unmount());
  });

  it('uses the latest delivery mode when it changes during evaluation', async () => {
    const scopeId = 'workspace_mode_change';
    await addNotificationRule(
      {
        name: 'Low glucose',
        enabled: true,
        range_start: 70,
        range_end: 180,
        hour_from_in_minutes: 0,
        hour_to_in_minutes: 1_439,
        trend: 'SingleDown',
      },
      {scopeId},
    );
    let releaseSnooze!: (value: boolean) => void;
    mockIsRuleSnoozed.mockReturnValueOnce(
      new Promise(resolve => {
        releaseSnooze = resolve;
      }),
    );
    const snapshot = {
      enrichedBg: {
        sgv: 64,
        date: Date.now() - 10_000,
        direction: 'SingleDown',
      },
    };
    const Harness = ({
      mode,
    }: {
      readonly mode: 'sound-and-vibrate' | 'silent';
    }) => {
      useGlucoseRuleNotifications(snapshot, scopeId, undefined, 'en', mode);
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness mode="sound-and-vibrate" />);
      await flushPromises();
      await flushPromises();
    });
    expect(mockIsRuleSnoozed).toHaveBeenCalledTimes(1);

    act(() => {
      tree!.update(<Harness mode="silent" />);
    });
    await act(async () => {
      releaseSnooze(false);
      await flushPromises();
      await flushPromises();
    });

    expect(notifee.displayNotification).toHaveBeenCalledTimes(1);
    expect(notifee.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'glucose-rule-alerts-silent-v2',
        vibration: false,
      }),
    );
    expect(notifee.displayNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        android: expect.objectContaining({
          channelId: 'glucose-rule-alerts-silent-v2',
        }),
      }),
    );
    act(() => tree!.unmount());
  });
});
