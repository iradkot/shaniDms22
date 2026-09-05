import React, {useRef} from 'react';
import renderer, {act} from 'react-test-renderer';
import {
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
  CORE_DESTINATION_IDS,
  type DestinationLocale,
} from '../../../src/product/destinations';
import {
  useBrowserCurrentSnapshot,
  type BrowserNightscoutRange,
  type BrowserNightscoutEntry,
} from '../../../src/platform/web';

class FakeVisibility {
  visibilityState: DocumentVisibilityState = 'visible';
  private readonly listeners = new Set<() => void>();

  addEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: 'visibilitychange', listener: () => void): void {
    this.listeners.delete(listener);
  }

  publish(): void {
    this.listeners.forEach(listener => listener());
  }
}

const target = resolveDestinationTarget(
  coreDestinationRegistry,
  createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph),
  undefined,
  {platform: 'web'},
);

describe('useBrowserCurrentSnapshot', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('refreshes while visible, pauses while hidden, and keeps the component mounted across locale changes', async () => {
    const nowMs = 1_800_000_000_000;
    const visibility = new FakeVisibility();
    const readEntries = jest
      .fn<
        Promise<BrowserNightscoutRange<BrowserNightscoutEntry>>,
        [number, number, AbortSignal?]
      >()
      .mockResolvedValue({
        records: [{date: nowMs - 60_000, sgv: 111, direction: 'Flat'}],
        freshness: {kind: 'fresh', fetchedAtMs: nowMs},
      });
    const client = {readEntries};
    const now = () => nowMs;
    let snapshot: ReturnType<typeof useBrowserCurrentSnapshot>;
    let mountIdentity: object | undefined;
    const Harness = ({locale}: {readonly locale: DestinationLocale}) => {
      const identity = useRef({});
      mountIdentity = identity.current;
      snapshot = useBrowserCurrentSnapshot({
        client,
        locale,
        target,
        visibility,
        refreshIntervalMs: 60_000,
        now,
      });
      return null;
    };

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<Harness locale="en" />);
      await Promise.resolve();
    });
    const firstMountIdentity = mountIdentity;
    expect(readEntries).toHaveBeenCalledTimes(1);
    expect(snapshot).toMatchObject({
      status: 'ready',
      glucoseLabel: '111 mg/dL',
    });

    visibility.visibilityState = 'hidden';
    await act(async () => {
      jest.advanceTimersByTime(2 * 60_000);
      await Promise.resolve();
    });
    expect(readEntries).toHaveBeenCalledTimes(1);

    visibility.visibilityState = 'visible';
    await act(async () => {
      visibility.publish();
      await Promise.resolve();
    });
    expect(readEntries).toHaveBeenCalledTimes(2);

    await act(async () => {
      tree!.update(<Harness locale="he" />);
      await Promise.resolve();
    });
    expect(mountIdentity).toBe(firstMountIdentity);
    expect(readEntries).toHaveBeenCalledTimes(3);
    act(() => tree!.unmount());
  });
});
