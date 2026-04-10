import {useCallback} from 'react';

import {deleteNotificationRule} from 'app/services/notifications/localNotificationsStore';

export const useDeleteNotification = () => {
  const deleteNotification = useCallback(async (notificationId: string) => {
    await deleteNotificationRule(notificationId);
  }, []);

  return {
    deleteNotification,
  };
};
