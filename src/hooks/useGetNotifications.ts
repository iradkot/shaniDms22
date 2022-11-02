import {useEffect, useState} from 'react';
import firestore from '@react-native-firebase/firestore';
import {NotificationResponse} from '../types/notifications';
import {docDTOConvert} from '../types/firestore';

export const useGetNotifications = () => {
  const [data, setData] = useState<NotificationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleNotificationsData = async () => {
    setIsLoading(true);
    const snapshot = await firestore().collection('notifications').get();
    const notifications = snapshot.docs.map(docDTOConvert);
    setData(notifications as NotificationResponse[]);
    setIsLoading(false);
  };
  useEffect(() => {
    handleNotificationsData();
  }, []);

  return {
    data,
    isLoading,
  };
};
