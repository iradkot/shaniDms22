import {AppState} from 'react-native';

import type {JournalSyncRetryTrigger} from '../../../modules/journal';

interface AppStateSubscription {
  remove(): void;
}

export interface JournalAppStateSource {
  addEventListener(
    event: 'change',
    listener: (state: string) => void,
  ): AppStateSubscription;
}

/** Retries pending Journal sync work as soon as the app becomes active. */
export const createNativeJournalForegroundRetryTrigger = (
  source: JournalAppStateSource = AppState,
): JournalSyncRetryTrigger => ({
  subscribe(listener) {
    const subscription = source.addEventListener('change', state => {
      if (state === 'active') {
        listener();
      }
    });
    return () => subscription.remove();
  },
});

export const nativeJournalForegroundRetryTrigger =
  createNativeJournalForegroundRetryTrigger();
