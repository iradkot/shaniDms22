import React, {FC} from 'react';
import {Notification} from '../../../../../types/notifications';
import styled from 'styled-components/native';
import {
  NotificationFirstRow,
  NotificationEnableSwitch,
  NotificationCardContainer,
  NotificationSecondRow,
  NotificationTitle,
} from './NotificationCard.style';
import DateTimePicker from '@react-native-community/datetimepicker';

const NotificationCardText = styled.Text`
  font-size: 18px;
`;
const formatMinutesToLocaleTimeString = (minutes: number) => {
  let hours: number | string = Math.floor(minutes / 60);
  if (hours < 10) {
    hours = `0${hours}`;
  }
  let minutesLeft: number | string = minutes % 60;
  if (minutesLeft < 10) {
    minutesLeft = `0${minutesLeft}`;
  }
  return `${hours}:${minutesLeft}`;
};

export const NotificationsCard: FC<{notification: Notification}> = ({
  notification,
}) => {
  return (
    <NotificationCardContainer>
      <NotificationFirstRow>
        <NotificationTitle>{notification.name}</NotificationTitle>
        <NotificationEnableSwitch />
        <NotificationCardText>
          {notification.enabled ? 'On' : 'Off'}
        </NotificationCardText>
      </NotificationFirstRow>
      <NotificationSecondRow>
        {/*  Display the hour_from_in_minutes and hour_to_in_minutes in a more readable format*/}
        {/*<NotificationCardText>*/}
        {/*  {formatMinutesToLocaleTimeString(notification.hour_from_in_minutes)} -{' '}*/}
        {/*  {formatMinutesToLocaleTimeString(notification.hour_to_in_minutes)}*/}
        {/*</NotificationCardText>*/}
        <DateTimePicker value={new Date()} mode="time" />
        <NotificationCardText>
          {notification.range_start} - {notification.range_end}
        </NotificationCardText>
        <NotificationCardText>{notification.trend}</NotificationCardText>
      </NotificationSecondRow>
    </NotificationCardContainer>
  );
};
