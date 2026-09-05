describe('BrowserApp Workspace lifecycle boundary', () => {
  class EventTargetFake {
    constructor() {
      this.listeners = new Map();
    }

    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) ?? new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type, listener) {
      this.listeners.get(type)?.delete(listener);
    }

    publish(type) {
      this.listeners.get(type)?.forEach(listener => listener());
    }

    count(type) {
      return this.listeners.get(type)?.size ?? 0;
    }
  }

  const flushPromises = () => new Promise(resolve => setImmediate(resolve));

  it('rechecks on reconnect, foreground, and a bounded cadence without listener leaks', async () => {
    const {activateBrowserNightscoutStatusMonitor} = require('../../../src/platform/web/nightscout/browserNightscoutClient');
    const connectivity = new EventTargetFake();
    const visibility = Object.assign(new EventTargetFake(), {
      visibilityState: 'hidden',
    });
    const currentStatus = {
      configured: true,
      sourceId: 'source-old',
      workspaceId: 'workspace-old',
    };
    const changedStatus = {
      configured: true,
      sourceId: 'source-new',
      workspaceId: 'workspace-new',
    };
    const readStatus = jest
      .fn()
      .mockResolvedValueOnce(currentStatus)
      .mockResolvedValueOnce(currentStatus)
      .mockResolvedValueOnce(changedStatus);
    const onIdentityChanged = jest.fn();
    let periodic;
    const cancelInterval = jest.fn();
    const deactivate = activateBrowserNightscoutStatusMonitor({
      currentStatus,
      connectivity,
      visibility,
      readStatus,
      onIdentityChanged,
      scheduleInterval: (listener, delayMs) => {
        expect(delayMs).toBe(5 * 60 * 1_000);
        periodic = listener;
        return 'interval-token';
      },
      cancelInterval,
    });

    expect(connectivity.count('online')).toBe(1);
    expect(visibility.count('visibilitychange')).toBe(1);
    connectivity.publish('online');
    await flushPromises();
    expect(readStatus).toHaveBeenCalledTimes(1);
    expect(onIdentityChanged).not.toHaveBeenCalled();

    visibility.publish('visibilitychange');
    await flushPromises();
    expect(readStatus).toHaveBeenCalledTimes(1);

    visibility.visibilityState = 'visible';
    visibility.publish('visibilitychange');
    await flushPromises();
    expect(readStatus).toHaveBeenCalledTimes(2);
    expect(onIdentityChanged).not.toHaveBeenCalled();

    periodic();
    await flushPromises();
    expect(readStatus).toHaveBeenCalledTimes(3);
    expect(onIdentityChanged).toHaveBeenCalledTimes(1);

    deactivate();
    deactivate();
    expect(connectivity.count('online')).toBe(0);
    expect(visibility.count('visibilitychange')).toBe(0);
    expect(cancelInterval).toHaveBeenCalledTimes(1);
    connectivity.publish('online');
    periodic();
    await flushPromises();
    expect(readStatus).toHaveBeenCalledTimes(3);
  });

  it('keeps the Workspace active when a periodic status check matches', async () => {
    const {activateBrowserNightscoutStatusMonitor} = require('../../../src/platform/web/nightscout/browserNightscoutClient');
    const visibility = Object.assign(new EventTargetFake(), {
      visibilityState: 'visible',
    });
    const status = {
      configured: true,
      sourceId: 'source-current',
      workspaceId: 'workspace-current',
    };
    const onIdentityChanged = jest.fn();
    let periodic;
    const deactivate = activateBrowserNightscoutStatusMonitor({
      currentStatus: status,
      connectivity: new EventTargetFake(),
      visibility,
      readStatus: jest.fn().mockResolvedValue(status),
      onIdentityChanged,
      scheduleInterval: listener => {
        periodic = listener;
        return 'interval-token';
      },
      cancelInterval: jest.fn(),
    });

    periodic();
    await flushPromises();
    expect(onIdentityChanged).not.toHaveBeenCalled();
    deactivate();
  });

  it('ignores a delayed status result after its Workspace scope is deactivated', async () => {
    const {activateBrowserNightscoutStatusMonitor} = require('../../../src/platform/web/nightscout/browserNightscoutClient');
    const connectivity = new EventTargetFake();
    let resolveStatus;
    const pendingStatus = new Promise(resolve => {
      resolveStatus = resolve;
    });
    const onIdentityChanged = jest.fn();
    const deactivate = activateBrowserNightscoutStatusMonitor({
      currentStatus: {
        configured: true,
        sourceId: 'source-old',
        workspaceId: 'workspace-old',
      },
      connectivity,
      visibility: Object.assign(new EventTargetFake(), {
        visibilityState: 'visible',
      }),
      readStatus: () => pendingStatus,
      onIdentityChanged,
      scheduleInterval: () => 'interval-token',
      cancelInterval: jest.fn(),
    });

    connectivity.publish('online');
    await Promise.resolve();
    deactivate();
    resolveStatus({
      configured: true,
      sourceId: 'source-new',
      workspaceId: 'workspace-new',
    });
    await flushPromises();

    expect(onIdentityChanged).not.toHaveBeenCalled();
  });
});
