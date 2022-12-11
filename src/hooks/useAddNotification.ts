/**
 * This hook is used to add a notification to the firebase database
 */

import {useCallback} from 'react';
import firestore from '@react-native-firebase/firestore';
import {NotificationRequest} from '../types/notifications';
import {useGetUser} from 'app/hooks/useGetUser';

export const useAddNotification = () => {
  const {userData} = useGetUser();
  const addNotification = useCallback(
    async (notification: NotificationRequest) => {
      const notificationRequest = {
        ...notification,
        related_user: firestore().collection('users').doc(userData?.id),
      };
      await firestore().collection('notifications').add(notificationRequest);
    },
    [userData?.id],
  );

  return {
    addNotification,
  };
};
