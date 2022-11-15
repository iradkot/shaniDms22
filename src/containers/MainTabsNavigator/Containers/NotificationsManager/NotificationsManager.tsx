// create a screen with crud operations to manage notifications
//
// Language: typescript
// Path: src/containers/MainTabsNavigator/Containers/NotificationsManager/NotificationsManager.tsx

import React, {FC} from 'react';
import {ActivityIndicator, FlatList, View} from 'react-native';
import {NavigationProp} from '@react-navigation/native';
import styled from 'styled-components/native';
import {useGetNotifications} from 'app/hooks/useGetNotifications';
import {useDeleteNotification} from 'app/hooks/useDeleteNotification';
import {ADD_NOTIFICATION_SCREEN} from 'app/constants/SCREEN_NAMES';
import {NotificationResponse} from 'app/types/notifications';
import {NotificationsCard} from './components/NotificationCard';

const NotificationsManagerContainer = styled.View`
  flex: 1;
  background-color: #fff;
`;

// create dummy home component with typescript
// TODO: rename component to NotificationsSettings
const NotificationsManager: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  const {data, isLoading, getNotificationsData} = useGetNotifications();
  const {deleteNotification} = useDeleteNotification();

  const getKeyExtractor = (notification: NotificationResponse) =>
    notification.id;

  const handleDeleteNotification = async (notificationId: string) => {
    await deleteNotification(notificationId);
    getNotificationsData();
  };

  const renderNotifications = () => {
    if (isLoading) {
      return (
        <View style={{padding: 40}}>
          <ActivityIndicator size={'large'} />
        </View>
      );
    }
    return (
      <FlatList
        data={data}
        renderItem={({item}) => (
          <NotificationsCard
            onDeleteNotification={handleDeleteNotification}
            notification={item}
          />
        )}
        keyExtractor={getKeyExtractor}
        refreshing={isLoading}
        onRefresh={getNotificationsData}
      />
    );
  };

  return (
    <NotificationsManagerContainer>
      {renderNotifications()}
      <AddNotificationButton
        callback={() => navigation.navigate(ADD_NOTIFICATION_SCREEN)}
      />
    </NotificationsManagerContainer>
  );
};

const AddNotificationButtonContainer = styled.TouchableOpacity`
  background-color: #ccc;
  padding: 10px;
  margin: 10px;
  border-radius: 5px;
`;

const AddNotificationButtonText = styled.Text`
  text-align: center;
  font-size: 18px;
`;

const AddNotificationButton: FC<{callback: () => void}> = ({callback}) => {
  return (
    <AddNotificationButtonContainer onPress={callback}>
      <AddNotificationButtonText>Add Notification</AddNotificationButtonText>
    </AddNotificationButtonContainer>
  );
};

export default NotificationsManager;
