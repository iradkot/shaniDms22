import {useState} from 'react';
import {NotificationResponse} from 'app/types/notifications';
import {useUpdateNotification} from 'app/hooks/notifications/useUpdateNotification';

export const useToggleNotification = (enabled: boolean) => {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isLoading, setIsLoading] = useState(false);
  const {updateNotification} = useUpdateNotification();

  const toggleNotification = async (
    notification: NotificationResponse,
  ): Promise<void> => {
    try {
      setIsLoading(true);
      const nextEnabled = !isEnabled;
      await updateNotification(notification.id, {
        ...notification,
        enabled: nextEnabled,
      });
      setIsEnabled(nextEnabled);
    } catch (error) {
      console.log(error);
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isEnabled,
    isLoading,
    toggleNotification,
  };
};
