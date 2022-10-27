/**
 * This hook is used to add a notification to the firebase database
 */

import {useCallback} from 'react';
import firestore from '@react-native-firebase/firestore';
import {Notification} from '../types/notifications';

export const useAddNotification = () => {
  const addNotification = useCallback(async (notification: Notification) => {
    await firestore()
      .collection('notifications')
      .doc(notification._id)
      .set(notification);
  }, []);

  return {
    addNotification,
  };
};
