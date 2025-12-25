/**
 * This hook is used to add a notification to the firebase database
 */

import {useCallback} from 'react';
import { firebaseApp } from 'app/firebase';
import { getFirestore, collection, doc, addDoc } from 'firebase/firestore';
import {NotificationRequest} from 'src/types/notifications';
import {useGetUser} from 'app/hooks/useGetUser';

export const useAddNotification = () => {
  const {userData} = useGetUser();
  const addNotification = useCallback(
    async (notification: NotificationRequest) => {
      const notificationRequest = {
        ...notification,
        related_user: doc(getFirestore(firebaseApp), 'users', userData?.id || ''),
      };
      await addDoc(collection(getFirestore(firebaseApp), 'notifications'), notificationRequest);
    },
    [userData?.id],
  );

  return {
    addNotification,
  };
};
