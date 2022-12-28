import {useState} from 'react';
import {NotificationResponse} from '../types/notifications';
import {useUpdateNotification} from './useUpdateNotification';

export const useToggleNotification = (enabled: boolean) => {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isLoading, setIsLoading] = useState(false);
  const {updateNotification} = useUpdateNotification();

  const toggleNotification = async (
    notification: NotificationResponse,
  ): Promise<void> => {
    try {
      setIsLoading(true);
      const newNotification: NotificationResponse = {
        ...notification,
        enabled: !isEnabled,
      };
      await updateNotification(newNotification);
      setIsLoading(false);
      setIsEnabled(!isEnabled);
    } catch (error) {
      console.log(error);
      setIsEnabled(isEnabled);
    }
  };

  return {
    isEnabled,
    isLoading,
    toggleNotification,
  };
};
