import React from 'react';
import {Platform} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {useAlertDeliveryMode} from 'app/hooks/useAlertDeliveryMode';
import type {AlertDeliveryModeState} from 'app/hooks/useAlertDeliveryMode';
import {
  getAlertDeliveryMode,
  setAlertDeliveryMode,
} from 'app/services/notifications/alertDeliveryPreferences';

jest.mock('app/services/notifications/alertDeliveryPreferences', () => ({
  DEFAULT_ALERT_DELIVERY_MODE: 'sound-and-vibrate',
  getAlertDeliveryMode: jest.fn(),
  setAlertDeliveryMode: jest.fn(),
}));

const getMode = getAlertDeliveryMode as jest.MockedFunction<
  typeof getAlertDeliveryMode
>;
const saveMode = setAlertDeliveryMode as jest.MockedFunction<
  typeof setAlertDeliveryMode
>;

describe('useAlertDeliveryMode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    saveMode.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('becomes synchronously unready when the workspace scope changes', async () => {
    let resolveA!: (mode: 'silent') => void;
    let resolveB!: (mode: 'silent') => void;
    getMode
      .mockImplementationOnce(
        () => new Promise(resolve => (resolveA = resolve)),
      )
      .mockImplementationOnce(
        () => new Promise(resolve => (resolveB = resolve)),
      );
    const states: AlertDeliveryModeState[] = [];
    const Harness = ({scopeId}: {readonly scopeId: string}) => {
      states.push(useAlertDeliveryMode(scopeId));
      return null;
    };
    let tree: renderer.ReactTestRenderer;

    act(() => {
      tree = renderer.create(<Harness scopeId="workspace-a" />);
    });
    await act(async () => {
      resolveA('silent');
      await Promise.resolve();
    });
    expect(states[states.length - 1]).toMatchObject({
      mode: 'silent',
      ready: true,
    });

    act(() => {
      tree!.update(<Harness scopeId="workspace-b" />);
    });
    expect(states[states.length - 1]).toMatchObject({
      mode: 'sound-and-vibrate',
      ready: false,
    });

    await act(async () => {
      resolveB('silent');
      await Promise.resolve();
    });
    expect(states[states.length - 1]).toMatchObject({
      mode: 'silent',
      ready: true,
    });
    act(() => tree!.unmount());
  });

  it('stays unready after a load failure and can retry safely', async () => {
    getMode
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce('silent');
    const states: AlertDeliveryModeState[] = [];
    const Harness = () => {
      states.push(useAlertDeliveryMode('workspace-a'));
      return null;
    };
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(states[states.length - 1]).toMatchObject({
      ready: false,
      error: true,
    });

    await act(async () => {
      states[states.length - 1].retry();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getMode).toHaveBeenCalledTimes(2);
    expect(states[states.length - 1]).toMatchObject({
      mode: 'silent',
      ready: true,
      error: false,
    });
    act(() => tree!.unmount());
  });

  it('normalizes an unsupported iOS vibration-only preference to silent', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    getMode.mockResolvedValue('vibrate-only');
    const states: AlertDeliveryModeState[] = [];
    const Harness = () => {
      states.push(useAlertDeliveryMode('workspace-ios'));
      return null;
    };
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(<Harness />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(states[states.length - 1]).toMatchObject({
      mode: 'silent',
      ready: true,
      error: false,
    });
    expect(saveMode).toHaveBeenCalledWith('workspace-ios', 'silent');
    act(() => tree!.unmount());
  });
});
