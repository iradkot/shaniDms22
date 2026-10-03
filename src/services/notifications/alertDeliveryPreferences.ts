import AsyncStorage from '@react-native-async-storage/async-storage';
import {withLocalAccountWrite} from '../../modules/privacy/localAccountCleanup';

import {
  ALERT_DELIVERY_MODES,
  DEFAULT_ALERT_DELIVERY_MODE,
  type AlertDeliveryMode,
} from 'app/modules/alerts';

const STORAGE_NAMESPACE = 'notifications:delivery-mode:v1';

const isDeliveryMode = (value: unknown): value is AlertDeliveryMode =>
  typeof value === 'string' &&
  (ALERT_DELIVERY_MODES as readonly string[]).includes(value);

const storageKey = (scopeId: string): string => {
  const normalized = scopeId.trim();
  if (!/^[a-z0-9][a-z0-9_-]{0,127}$/i.test(normalized)) {
    throw new Error('Alert delivery preference scope is invalid.');
  }
  return `${STORAGE_NAMESPACE}:${normalized}`;
};

export {DEFAULT_ALERT_DELIVERY_MODE};

/** Device-local: notification capabilities and channel settings differ by device. */
export const getAlertDeliveryMode = async (
  scopeId: string,
): Promise<AlertDeliveryMode> => {
  const stored = await AsyncStorage.getItem(storageKey(scopeId));
  return isDeliveryMode(stored) ? stored : DEFAULT_ALERT_DELIVERY_MODE;
};

export const setAlertDeliveryMode = async (
  scopeId: string,
  mode: AlertDeliveryMode,
  ownerProductUserId?: string,
): Promise<void> => {
  if (!isDeliveryMode(mode)) {
    throw new Error('Alert delivery mode is invalid.');
  }
  await withLocalAccountWrite(AsyncStorage, ownerProductUserId,
    () => AsyncStorage.setItem(storageKey(scopeId), mode));
};
