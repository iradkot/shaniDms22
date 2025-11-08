/**
 * This hook is used to delete a notification from the firebase database
 */
import {useCallback} from 'react';
import { firebaseApp } from 'app/firebase';
import { getFirestore, doc, deleteDoc } from 'firebase/firestore';

export const useDeleteNotification = () => {
  const deleteNotification = useCallback(async (notificationId: string) => {
    await deleteDoc(doc(getFirestore(firebaseApp), 'notifications', notificationId));
  }, []);

  return {
    deleteNotification,
  };
};
