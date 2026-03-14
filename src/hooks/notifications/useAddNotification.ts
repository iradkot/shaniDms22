/**
 * This hook is used to add a notification to the firebase database
 */

import {useCallback} from 'react';
import firestore, {FirebaseFirestoreTypes} from '@react-native-firebase/firestore';
import auth from '@react-native-firebase/auth';
import {NotificationRequest, NotificationStored} from 'src/types/notifications';
import {useGetUser} from 'app/hooks/useGetUser';

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export const useAddNotification = () => {
  const {userData} = useGetUser();

  const addNotification = useCallback(
    async (notification: NotificationRequest) => {
      const uid = userData?.id ?? auth().currentUser?.uid;
      if (!uid) {
        throw new Error('Missing user context for notification create');
      }

      const userRef = firestore().collection('users').doc(uid);
      const payload: NotificationStored = {
        ...notification,
        range_start: toNumber(notification.range_start),
        range_end: toNumber(notification.range_end),
        hour_from_in_minutes: toNumber(notification.hour_from_in_minutes),
        hour_to_in_minutes: toNumber(notification.hour_to_in_minutes),
        related_user: userRef as FirebaseFirestoreTypes.DocumentReference,
      };

      await firestore().collection('notifications').add(payload);
    },
    [userData?.id],
  );

  return {addNotification};
};
