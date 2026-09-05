import React from 'react';
import renderer, {act} from 'react-test-renderer';

import type {JournalWorkspace} from 'app/modules/journal';
import {createDefaultProductPersonalization} from 'app/product/personalization';

const mockJournalOpen = jest.fn();
const mockPersonalizationOpen = jest.fn();
const mockPersonalizationSynchronize = jest.fn();

jest.mock('app/platform/native/journal/nativeJournalEngine', () => ({
  nativeJournalEngine: {
    open: (...args: unknown[]) => mockJournalOpen(...args),
  },
}));
jest.mock('app/platform/native/journal/nativeJournalRetryTrigger', () => ({
  nativeJournalForegroundRetryTrigger: {subscribe: () => () => undefined},
}));
jest.mock('app/platform/native/mealMedia', () => ({
  retryPendingNativeMealImageDeletions: async () => undefined,
}));
jest.mock(
  'app/platform/native/personalization/nativeProductPersonalizationStore',
  () => ({
    nativeProductPersonalizationRepository: {
      open: (...args: unknown[]) => mockPersonalizationOpen(...args),
      synchronize: (...args: unknown[]) =>
        mockPersonalizationSynchronize(...args),
      save: jest.fn(),
    },
  }),
);

import {
  useNativeJournalWorkspace,
  type NativeJournalWorkspaceState,
} from 'app/platform/native/journal/useNativeJournalWorkspace';
import {
  useNativeProductPersonalization,
  type NativeProductPersonalizationState,
} from 'app/platform/native/personalization/useNativeProductPersonalization';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(next => {
    resolve = next;
  });
  return {promise, resolve};
};

const journalWorkspace = (workspaceId: string): JournalWorkspace =>
  ({
    scope: {
      productUserId: 'account-a',
      workspaceId,
      nightscoutSourceId: `source-${workspaceId}`,
    },
    maintenance: {purgeExpiredTrash: jest.fn(async () => 0)},
    sync: {activate: jest.fn(() => () => undefined)},
  } as unknown as JournalWorkspace);

describe('native Workspace hook account isolation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('never returns account A Journal while account B is opening', async () => {
    const accountA = deferred<{
      ok: true;
      value: JournalWorkspace;
    }>();
    const accountB = deferred<{
      ok: true;
      value: JournalWorkspace;
    }>();
    mockJournalOpen
      .mockReturnValueOnce(accountA.promise)
      .mockReturnValueOnce(accountB.promise);
    const observed: Array<{
      userId: string | null;
      state: NativeJournalWorkspaceState;
    }> = [];
    const Consumer = ({userId}: {readonly userId: string | null}) => {
      const state = useNativeJournalWorkspace({
        firebaseUserId: userId,
        nightscoutBaseUrl:
          userId === null ? null : `https://${userId}.example`,
      });
      observed.push({userId, state});
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Consumer userId="account-a" />);
    });
    await act(async () => {
      accountA.resolve({ok: true, value: journalWorkspace('workspace-a')});
      await accountA.promise;
    });
    expect(observed.at(-1)?.state.status).toBe('ready');

    const beforeSwitch = observed.length;
    act(() => tree!.update(<Consumer userId="account-b" />));
    expect(observed[beforeSwitch]).toMatchObject({
      userId: 'account-b',
      state: {status: 'loading'},
    });
    expect(observed.slice(beforeSwitch)).not.toContainEqual(
      expect.objectContaining({
        userId: 'account-b',
        state: expect.objectContaining({status: 'ready'}),
      }),
    );

    const beforeSignOut = observed.length;
    act(() => tree!.update(<Consumer userId={null} />));
    expect(observed[beforeSignOut]).toEqual({
      userId: null,
      state: {status: 'unavailable'},
    });
    act(() => tree!.unmount());
  });

  it('never returns account A personalization while account B is opening', async () => {
    const preferences = createDefaultProductPersonalization();
    const accountB = deferred<typeof preferences>();
    mockPersonalizationOpen
      .mockResolvedValueOnce(preferences)
      .mockReturnValueOnce(accountB.promise);
    mockPersonalizationSynchronize.mockResolvedValue({
      preferences,
      pendingCount: 0,
      remoteEnabled: true,
      failedSections: [],
    });
    const observed: Array<{
      userId: string | null;
      state: NativeProductPersonalizationState;
    }> = [];
    const Consumer = ({userId}: {readonly userId: string | null}) => {
      const state = useNativeProductPersonalization({
        firebaseUserId: userId,
        nightscoutBaseUrl:
          userId === null ? null : `https://${userId}.example`,
        layout: 'phone',
      });
      observed.push({userId, state});
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Consumer userId="account-a" />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(observed.at(-1)?.state.status).toBe('ready');

    const beforeSwitch = observed.length;
    act(() => tree!.update(<Consumer userId="account-b" />));
    expect(observed[beforeSwitch]).toMatchObject({
      userId: 'account-b',
      state: {status: 'loading'},
    });

    const beforeSignOut = observed.length;
    act(() => tree!.update(<Consumer userId={null} />));
    expect(observed[beforeSignOut]).toEqual({
      userId: null,
      state: {status: 'unavailable'},
    });
    act(() => tree!.unmount());
  });
});
