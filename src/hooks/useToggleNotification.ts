import {useState} from 'react';
import {NotificationResponse} from '../types/notifications';
import {useUpdateNotification} from './useUpdateNotification';

export const useToggleNotification = (enabled: boolean) => {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const {updateNotification} = useUpdateNotification();

  const toggleNotification = (notification: NotificationResponse): void => {
    setIsEnabled(!notification.enabled);
    const newNotification: NotificationResponse = {
      ...notification,
      enabled: !notification.enabled,
    };
    updateNotification(newNotification).catch(error => {
      console.log(error);
      setIsEnabled(notification.enabled);
    });
  };

  return {
    isEnabled,
    toggleNotification,
  };
};
