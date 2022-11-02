/**
 * This hook is used to update the notification in the firebase database
 */
import {useState} from 'react';
import firestore from '@react-native-firebase/firestore';
import {NotificationResponse} from '../types/notifications';

export const useUpdateNotification = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  const updateNotification = async (notification: NotificationResponse) => {
    setIsLoading(true);
    try {
      await firestore()
        .collection('notifications')
        .doc(notification.id)
        .update(notification);
      setIsLoading(false);
    } catch (err) {
      setError((err as Error).message);
      setIsLoading(false);
    }
  };

  return {updateNotification, isLoading, error};
};
