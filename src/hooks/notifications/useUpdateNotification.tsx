/**
 * This hook is used to update the notification in the firebase database
 */
import {useState} from 'react';
import firestore from '@react-native-firebase/firestore';
import {NotificationRequest} from 'src/types/notifications';

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const useUpdateNotification = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  const updateNotification = async (
    id: string,
    notification: NotificationRequest,
  ): Promise<void> => {
    setIsLoading(true);
    try {
      const payload = {
        ...notification,
        range_start: toNumber(notification.range_start),
        range_end: toNumber(notification.range_end),
        hour_from_in_minutes: toNumber(notification.hour_from_in_minutes),
        hour_to_in_minutes: toNumber(notification.hour_to_in_minutes),
      };

      await firestore().collection('notifications').doc(id).update(payload);
      setIsLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setIsLoading(false);
    }
  };

  return {updateNotification, isLoading, error};
};
