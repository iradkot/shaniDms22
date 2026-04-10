import {useCallback} from 'react';

import {NotificationRequest} from 'src/types/notifications';
import {addNotificationRule} from 'app/services/notifications/localNotificationsStore';

export const useAddNotification = () => {
  const addNotification = useCallback(async (notification: NotificationRequest) => {
    await addNotificationRule(notification);
  }, []);

  return {addNotification};
};
