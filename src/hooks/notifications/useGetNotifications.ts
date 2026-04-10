import {useCallback, useEffect, useState} from 'react';

import {NotificationResponse} from 'app/types/notifications';
import {getNotificationRules} from 'app/services/notifications/localNotificationsStore';

export const useGetNotifications = () => {
  const [data, setData] = useState<NotificationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const getNotificationsData = useCallback(async () => {
    setIsLoading(true);
    try {
      const rules = await getNotificationRules();
      setData(rules);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    getNotificationsData();
  }, [getNotificationsData]);

  return {data, isLoading, getNotificationsData};
};
