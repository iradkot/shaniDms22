import {useEffect, useState} from 'react';
import firestore from '@react-native-firebase/firestore';
import {Notification} from '../types/notifications';

export const useGetNotifications = () => {
  const [data, setData] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleNotificationsData = async () => {
    setIsLoading(true);
    const snapshot = await firestore().collection('notifications').get();
    console.log(snapshot.docs);
    const notifications = snapshot.docs.map(doc => doc.data());
    setData(notifications as Notification[]);
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
