import type {JournalSyncRetryTrigger} from '../../../modules/journal';

/** Retries Journal sync when the browser reconnects or its tab becomes visible. */
export const createBrowserJournalRetryTrigger =
  (): JournalSyncRetryTrigger => ({
    subscribe(listener) {
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          listener();
        }
      };
      globalThis.addEventListener?.('online', listener);
      globalThis.document?.addEventListener?.('visibilitychange', onVisible);
      return () => {
        globalThis.removeEventListener?.('online', listener);
        globalThis.document?.removeEventListener?.(
          'visibilitychange',
          onVisible,
        );
      };
    },
  });
