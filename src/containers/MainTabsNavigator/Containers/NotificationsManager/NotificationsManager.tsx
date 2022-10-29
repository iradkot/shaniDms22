// create a screen with crud operations to manage notifications
//
// Language: typescript
// Path: src/containers/MainTabsNavigator/Containers/NotificationsManager/NotificationsManager.tsx

import React, {FC} from 'react';
import {Animated, Text} from 'react-native';
// @ts-ignore
import styled from 'styled-components/native';
import {useGetNotifications} from '../../../../hooks/useGetNotifications';
import {NavigationProp} from '@react-navigation/native';
import {ADD_NOTIFICATION_SCREEN} from '../../../../constants/SCREEN_NAMES';
import {NotificationsCard} from './components/NotificationCard';
import FlatList = Animated.FlatList;

const NotificationsManagerContainer = styled.View`
  flex: 1;
  background-color: #fff;
`;

// create dummy home component with typescript
// TODO: rename component to NotificationsSettings
const NotificationsManager: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
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

// @ts-ignore
const AddNotificationButton: FC = ({callback}) => {
  return (
    <AddNotificationButtonContainer onPress={callback}>
      <AddNotificationButtonText>Add Notification</AddNotificationButtonText>
    </AddNotificationButtonContainer>
  );
};

export default NotificationsManager;
