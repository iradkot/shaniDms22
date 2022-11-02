import React, {FC} from 'react';
import {useToggleNotification} from '../../../../../hooks/useToggleNotification';
import {Notification} from '../../../../../types/notifications';
import {formatMinutesToLocaleTimeString} from '../../../../../utils/datetime.utils';
import {
  NotificationEnableSwitch,
  NotificationCardContainer,
  NotificationTitle,
  NotificationCardText,
  NotificationCardDetails,
  NotificationCardRow,
  NotificationSwitchContainer,
} from './NotificationCard.style';

const BUTTON_OPACITY_LEVEL = 0.6;

export const NotificationsCard: FC<{notification: Notification}> = ({
  notification,
}) => {
  const {toggleNotification, isEnabled} = useToggleNotification(
    notification.enabled,
  );
  const onNotificationPress = () => {
    console.log('Pressed');
  };

  const handleToggleNotification = () => {
    console.log('toggle');
  };

  return (
    <NotificationCardContainer
      activeOpacity={BUTTON_OPACITY_LEVEL}
      onPress={onNotificationPress}>
      <NotificationCardDetails>
        <NotificationCardRow>
          <NotificationTitle>{notification.name}</NotificationTitle>
        </NotificationCardRow>
        <NotificationCardRow>
          {/*  Display the hour_from_in_minutes and hour_to_in_minutes in a more readable format*/}
          <NotificationCardText>Notification hour:</NotificationCardText>
          <NotificationCardText>
            {formatMinutesToLocaleTimeString(notification.hour_from_in_minutes)}{' '}
            - {formatMinutesToLocaleTimeString(notification.hour_to_in_minutes)}
          </NotificationCardText>
        </NotificationCardRow>
        <NotificationCardRow>
          <NotificationCardText>Range:</NotificationCardText>
          <NotificationCardText>
            {notification.range_start} - {notification.range_end}
          </NotificationCardText>
        </NotificationCardRow>
      </NotificationCardDetails>
      <NotificationSwitchContainer>
        <NotificationEnableSwitch
          value={isEnabled}
          onChange={handleToggleNotification}
        />
      </NotificationSwitchContainer>
    </NotificationCardContainer>
  );
};
