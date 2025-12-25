import {useEffect, useState} from 'react';
import { firebaseApp } from 'app/firebase';
import { getFirestore, collection, getDocs } from 'firebase/firestore';
import {NotificationResponse} from 'app/types/notifications';
import {docDTOConvert} from 'app/types/firestore';

export const useGetNotifications = () => {
  const [data, setData] = useState<NotificationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getNotificationsData = async () => {
    setIsLoading(true);
    const snapshot = await getDocs(collection(getFirestore(firebaseApp), 'notifications'));
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
