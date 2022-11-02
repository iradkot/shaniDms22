/**
 * This hook is used to add a notification to the firebase database
 */

import {useCallback} from 'react';
import firestore from '@react-native-firebase/firestore';
import {NotificationRequest} from '../types/notifications';

export const useAddNotification = () => {
  const addNotification = useCallback(
    async (notification: NotificationRequest) => {
      await firestore().collection('notifications').add(notification);
    },
    [],
  );

  return {
    addNotification,
  };
};
