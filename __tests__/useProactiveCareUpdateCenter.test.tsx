import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {AppOwnedUpdateCenterRepository} from 'app/modules/alerts';
import {useProactiveCareUpdateCenter} from 'app/hooks/useProactiveCareUpdateCenter';

const createRepository = (): AppOwnedUpdateCenterRepository => ({
  append: jest.fn(async value => ({
    ...value,
    id: 'update-1',
    readState: 'unread' as const,
  })),
  subscribe: () => () => undefined,
  getSnapshot: () => ({status: 'ready', items: []}),
  refresh: async () => undefined,
  markRead: async () => undefined,
});

const Probe = ({repository}: {repository: AppOwnedUpdateCenterRepository}) => {
  useProactiveCareUpdateCenter({
    scopeId: 'workspace_a',
    locale: 'en',
    repository,
    preMealNotificationsEnabled: true,
    preMealIntent: {startedAtMs: 1_700_000_000_000, expiresAtMs: 1_700_005_400_000},
  });
  return null;
};

describe('proactive care Update Center projection', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('projects the latest generated brief and approved reminder with retry keys', async () => {
    await AsyncStorage.setItem(
      'proactiveCare:dailyBrief:latestBrief:workspace_a',
      JSON.stringify({
        title: 'Yesterday summary',
        body: 'Factual body',
        source: 'fallback',
        createdAt: '2026-08-20T08:00:00.000Z',
      }),
    );
    const repository = createRepository();
    await act(async () => {
      TestRenderer.create(<Probe repository={repository} />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(repository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: expect.stringMatching(/^daily-brief:/),
        kind: 'generated-update',
      }),
    );
    expect(repository.append).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'pre-meal:1700000000000',
        kind: 'reminder',
      }),
    );
  });
});
