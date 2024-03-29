import {useEffect, useState} from 'react';
import firestore from '@react-native-firebase/firestore';
import {NotificationResponse} from 'app/types/notifications';
import {docDTOConvert} from 'app/types/firestore';

export const useGetNotifications = () => {
  const [data, setData] = useState<NotificationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getNotificationsData = async () => {
    setIsLoading(true);
    const snapshot = await firestore().collection('notifications').get();
    const notifications = snapshot.docs.map(docDTOConvert);
    setData(notifications as NotificationResponse[]);
    setIsLoading(false);
  };
  useEffect(() => {
    getNotificationsData();
  }, []);

  return {
    data,
    isLoading,
    getNotificationsData,
  };
};
