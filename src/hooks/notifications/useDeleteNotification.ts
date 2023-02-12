/**
 * This hook is used to delete a notification from the firebase database
 */
import {useCallback} from 'react';
import firestore from '@react-native-firebase/firestore';

export const useDeleteNotification = () => {
  const deleteNotification = useCallback(async (notificationId: string) => {
    await firestore().collection('notifications').doc(notificationId).delete();
  }, []);

  return {
    deleteNotification,
  };
};
