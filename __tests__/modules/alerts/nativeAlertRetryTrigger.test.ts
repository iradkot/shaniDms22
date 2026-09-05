import {
  createNativeAlertRetryTrigger,
  type AlertAppStateSource,
  type AlertRetryTimerSource,
} from 'app/platform/native/alerts/nativeAlertRetryTrigger';
import {activateNativeAlertSynchronization} from 'app/platform/native/alerts/nativeOfflineAlertRepositories';

describe('native alert synchronization lifecycle', () => {
  it('retries on foreground and while active, then removes every listener', () => {
    let appStateListener: ((state: string) => void) | undefined;
    let intervalListener: (() => void) | undefined;
    const remove = jest.fn();
    const clearInterval = jest.fn();
    const appState: AlertAppStateSource = {
      currentState: 'background',
      addEventListener: (_event, listener) => {
        appStateListener = listener;
        return {remove};
      },
    };
    const timers: AlertRetryTimerSource = {
      setInterval: listener => {
        intervalListener = listener;
        return 'timer';
      },
      clearInterval,
    };
    const listener = jest.fn();
    const unsubscribe = createNativeAlertRetryTrigger(
      appState,
      timers,
      1_000,
    ).subscribe(listener);

    intervalListener?.();
    expect(listener).not.toHaveBeenCalled();
    appStateListener?.('active');
    intervalListener?.();
    expect(listener).toHaveBeenCalledTimes(2);
    appStateListener?.('background');
    intervalListener?.();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(clearInterval).toHaveBeenCalledWith('timer');
  });

  it('activates both remote-capable repositories and disposes them together', () => {
    const trigger = {subscribe: jest.fn(() => () => undefined)};
    const stopRules = jest.fn();
    const stopUpdates = jest.fn();
    const rules = {activate: jest.fn(() => stopRules)};
    const updates = {activate: jest.fn(() => stopUpdates)};

    const dispose = activateNativeAlertSynchronization(
      {rules, updates},
      trigger,
    );
    expect(rules.activate).toHaveBeenCalledWith(trigger);
    expect(updates.activate).toHaveBeenCalledWith(trigger);

    dispose();
    expect(stopRules).toHaveBeenCalledTimes(1);
    expect(stopUpdates).toHaveBeenCalledTimes(1);
  });
});
