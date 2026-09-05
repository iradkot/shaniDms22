import {AppState} from 'react-native';

import type {AlertSyncRetryTrigger} from '../../../modules/alerts';

interface AppStateSubscription {
  remove(): void;
}

export interface AlertAppStateSource {
  readonly currentState?: string;
  addEventListener(
    event: 'change',
    listener: (state: string) => void,
  ): AppStateSubscription;
}

export interface AlertRetryTimerSource {
  setInterval(listener: () => void, intervalMs: number): unknown;
  clearInterval(timer: unknown): void;
}

const nativeTimers: AlertRetryTimerSource = {
  setInterval: (listener, intervalMs) => setInterval(listener, intervalMs),
  clearInterval: timer => clearInterval(timer as ReturnType<typeof setInterval>),
};

/**
 * Retries durable alert outboxes at startup, on foreground, and periodically
 * while the app remains active after connectivity returns.
 */
export const createNativeAlertRetryTrigger = (
  appState: AlertAppStateSource = AppState,
  timers: AlertRetryTimerSource = nativeTimers,
  retryIntervalMs = 30_000,
): AlertSyncRetryTrigger => ({
  subscribe(listener) {
    let active = appState.currentState === undefined || appState.currentState === 'active';
    const timer = timers.setInterval(() => {
      if (active) {
        listener();
      }
    }, retryIntervalMs);
    const subscription = appState.addEventListener('change', state => {
      active = state === 'active';
      if (active) {
        listener();
      }
    });
    return () => {
      subscription.remove();
      timers.clearInterval(timer);
    };
  },
});

export const nativeAlertRetryTrigger = createNativeAlertRetryTrigger();
