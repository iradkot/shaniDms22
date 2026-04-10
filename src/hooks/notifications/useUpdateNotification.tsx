import {useState} from 'react';
import {NotificationRequest} from 'src/types/notifications';

import {updateNotificationRule} from 'app/services/notifications/localNotificationsStore';

export const useUpdateNotification = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  const updateNotification = async (
    id: string,
    notification: NotificationRequest,
  ): Promise<void> => {
    setIsLoading(true);
    try {
      await updateNotificationRule(id, notification);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {updateNotification, isLoading, error};
};
