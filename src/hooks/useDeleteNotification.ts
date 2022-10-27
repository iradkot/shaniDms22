/**
 * This hook is used to delete a notification from the firebase database
 */
import {useCallback} from 'react';
import firestore from '@react-native-firebase/firestore';
import {Notification} from '../types/notifications';

export const useDeleteNotification = () => {
  const deleteNotification = useCallback(async (notification: Notification) => {
    await firestore()
      .collection('notifications')
      .doc(notification._id)
      .delete();
  }, []);

  return {
    deleteNotification,
  };
};
