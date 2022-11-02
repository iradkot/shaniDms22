import {useState} from 'react';
import {Notification} from '../types/notifications';
import {useUpdateNotification} from './useUpdateNotification';

export const useToggleNotification = (enabled = false) => {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const {updateNotification} = useUpdateNotification();

  const toggleNotification = (notification: Notification) => {
    setIsEnabled(!notification.enabled);
    const newNotification: Notification = {
      ...notification,
      enabled: !notification.enabled,
    };
    updateNotification(newNotification).catch(() => {
      setIsEnabled(notification.enabled);
    });
  };

  return {
    isEnabled,
    toggleNotification,
  };
};
