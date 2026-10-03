import {useCallback, useEffect, useRef, useState} from 'react';
import {Platform} from 'react-native';

import type {AlertDeliveryMode} from 'app/modules/alerts';
import {
  DEFAULT_ALERT_DELIVERY_MODE,
  getAlertDeliveryMode,
  setAlertDeliveryMode,
} from 'app/services/notifications/alertDeliveryPreferences';

export interface AlertDeliveryModeState {
  readonly mode: AlertDeliveryMode;
  readonly ready: boolean;
  readonly error: boolean;
  readonly retry: () => void;
  readonly setMode: (mode: AlertDeliveryMode) => Promise<void>;
}

export const useAlertDeliveryMode = (
  scopeId?: string,
): AlertDeliveryModeState => {
  const [loaded, setLoaded] = useState<{
    readonly scopeId: string | undefined;
    readonly mode: AlertDeliveryMode;
    readonly ready: boolean;
    readonly error: boolean;
  }>({
    scopeId: undefined,
    mode: DEFAULT_ALERT_DELIVERY_MODE,
    ready: false,
    error: false,
  });
  const [reloadKey, setReloadKey] = useState(0);
  const revision = useRef(0);

  const mode =
    loaded.scopeId === scopeId ? loaded.mode : DEFAULT_ALERT_DELIVERY_MODE;
  const ready = loaded.scopeId === scopeId && loaded.ready;
  const error = loaded.scopeId === scopeId && loaded.error;

  useEffect(() => {
    const run = revision.current + 1;
    revision.current = run;
    setLoaded({
      scopeId,
      mode: DEFAULT_ALERT_DELIVERY_MODE,
      ready: false,
      error: false,
    });
    if (scopeId === undefined) {
      return undefined;
    }
    let active = true;
    getAlertDeliveryMode(scopeId)
      .then(stored => {
        if (active && revision.current === run) {
          const supported =
            Platform.OS === 'ios' && stored === 'vibrate-only'
              ? 'silent'
              : stored;
          setLoaded({scopeId, mode: supported, ready: true, error: false});
          if (supported !== stored) {
            setAlertDeliveryMode(scopeId, supported).catch(() => undefined);
          }
        }
      })
      .catch(() => {
        if (active && revision.current === run) {
          setLoaded({
            scopeId,
            mode: DEFAULT_ALERT_DELIVERY_MODE,
            ready: false,
            error: true,
          });
        }
      });
    return () => {
      active = false;
    };
  }, [reloadKey, scopeId]);

  const retry = useCallback(() => {
    setReloadKey(current => current + 1);
  }, []);

  const setMode = useCallback(
    async (next: AlertDeliveryMode): Promise<void> => {
      if (scopeId === undefined) {
        throw new Error('Alert delivery preferences are unavailable.');
      }
      const supportedNext =
        Platform.OS === 'ios' && next === 'vibrate-only' ? 'silent' : next;
      const run = revision.current + 1;
      revision.current = run;
      const previous = mode;
      setLoaded({scopeId, mode: supportedNext, ready: true, error: false});
      try {
        await setAlertDeliveryMode(scopeId, supportedNext);
      } catch (cause) {
        if (revision.current === run) {
          setLoaded({scopeId, mode: previous, ready: true, error: false});
        }
        throw cause;
      }
    },
    [mode, scopeId],
  );

  return {mode, ready, error, retry, setMode};
};
