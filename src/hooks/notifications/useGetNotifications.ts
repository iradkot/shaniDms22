import {useCallback, useEffect, useState} from 'react';
import firestore from '@react-native-firebase/firestore';
import {NotificationResponse} from 'app/types/notifications';
import {docDTOConvert} from 'app/types/firestore';
import {useGetUser} from 'app/hooks/useGetUser';

export const useGetNotifications = () => {
  const [data, setData] = useState<NotificationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const {userData} = useGetUser();

  const getNotificationsData = useCallback(async () => {
    if (!userData?.id) {
      setData([]);
      return;
    }
    setIsLoading(true);
    const userRef = firestore().collection('users').doc(userData.id);
    const snapshot = await firestore()
      .collection('notifications')
      .where('related_user', '==', userRef)
      .get();
    const notifications = snapshot.docs.map(docDTOConvert) as NotificationResponse[];
    setData(notifications);
    setIsLoading(false);
  }, [userData?.id]);

  useEffect(() => {
    getNotificationsData();
  }, [getNotificationsData]);

  return {data, isLoading, getNotificationsData};
};
