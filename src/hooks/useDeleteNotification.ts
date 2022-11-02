/**
 * This hook is used to delete a notification from the firebase database
 */
import {useCallback} from 'react';
import firestore from '@react-native-firebase/firestore';
import {NotificationResponse} from '../types/notifications';

export const useDeleteNotification = () => {
  const deleteNotification = useCallback(
    async (notification: NotificationResponse) => {
      await firestore()
        .collection('notifications')
        .doc(notification.id)
        .delete();
    },
    [],
  );

  return {
    deleteNotification,
  };
};
