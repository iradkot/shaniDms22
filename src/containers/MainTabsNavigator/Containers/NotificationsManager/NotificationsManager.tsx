// create a screen with crud operations to manage notifications
//
// Language: typescript
// Path: src/containers/MainTabsNavigator/Containers/NotificationsManager/NotificationsManager.tsx

import React, {FC} from 'react';
import {Animated, Text} from 'react-native';
// @ts-ignore
import styled from 'styled-components/native';
import {useGetNotifications} from '../../../../hooks/useGetNotifications';
import {Notification} from '../../../../types/notifications';
import FlatList = Animated.FlatList;

const NotificationsManagerContainer = styled.View`
  flex: 1;
  background-color: #fff;
`;

const NotificationCardContainer = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom-width: 1px;
  border-bottom-color: #ccc;
`;
const NotificationCardText = styled.Text`
  font-size: 18px;
`;

const formatMinutesToLocaleTimeString = (minutes: number) => {
  const date = new Date();
  date.setHours(0, minutes, 0, 0);
  return date.toLocaleTimeString();
};

export const NotificationsCard: FC<{notification: Notification}> = ({
  notification,
}) => {
  return (
    <NotificationCardContainer>
      <NotificationCardText>{notification.name}</NotificationCardText>
      <NotificationCardText>
        {notification.enabled ? 'On' : 'Off'}
      </NotificationCardText>
      {/*  Display the hour_from_in_minutes and hour_to_in_minutes in a more readable format*/}
      <NotificationCardText>
        {formatMinutesToLocaleTimeString(notification.hour_from_in_minutes)} -{' '}
        {formatMinutesToLocaleTimeString(notification.hour_to_in_minutes)}
      </NotificationCardText>
      <NotificationCardText>
        {notification.range_start} - {notification.range_end}
      </NotificationCardText>
      <NotificationCardText>{notification.trend}</NotificationCardText>
    </NotificationCardContainer>
  );
};

// create dummy home component with typescript
// TODO: rename component to NotificationsSettings
const NotificationsManager: React.FC = () => {
  const {data, isLoading} = useGetNotifications();

  const renderNotifications = () => {
    if (isLoading) {
      return <Text>Loading...</Text>;
    }
    return (
      <FlatList
        data={data}
        renderItem={({item}) => <NotificationsCard notification={item} />}
        keyExtractor={item => item._id}
      />
    );
  };

  return (
    <NotificationsManagerContainer>
      {renderNotifications()}
    </NotificationsManagerContainer>
  );
};

export default NotificationsManager;
