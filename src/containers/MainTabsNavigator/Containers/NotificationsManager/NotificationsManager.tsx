// create a screen with crud operations to manage notifications
//
// Language: typescript
// Path: src/containers/MainTabsNavigator/Containers/NotificationsManager/NotificationsManager.tsx

import React, {FC} from 'react';
import {
  ActivityIndicator,
  FlatList,
  ListRenderItemInfo,
  View,
  Text,
} from 'react-native';
import {NavigationProp} from '@react-navigation/native';
import styled from 'styled-components/native';
import {useGetNotifications} from 'app/hooks/notifications/useGetNotifications';
import {useDeleteNotification} from 'app/hooks/notifications/useDeleteNotification';
import {
  ADD_NOTIFICATION_SCREEN,
  EDIT_NOTIFICATION_SCREEN,
} from 'app/constants/SCREEN_NAMES';
import {NotificationResponse} from 'app/types/notifications';
import {NotificationsCard} from './components/NotificationCard';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

const NotificationsManagerContainer = styled.View`
  flex: 1;
  background-color: #f2f2f2;
  padding: 8px;
`;

const InfoCard = styled.View`
  background-color: #e3f2fd;
  border-radius: 10px;
  padding: 10px;
  margin: 8px;
`;

const InfoTitle = styled.Text`
  font-weight: 700;
  color: #0d47a1;
  margin-bottom: 4px;
`;

const InfoBody = styled.Text`
  color: #0d47a1;
`;

// create dummy home component with typescript
// TODO: rename component to NotificationsSettings
const NotificationsManager: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  const {data, isLoading, getNotificationsData} = useGetNotifications();
  const {deleteNotification} = useDeleteNotification();
  const {language} = useAppLanguage();

  const getKeyExtractor = (notification: NotificationResponse) =>
    notification.id;

  const handleDeleteNotification = async (notificationId: string) => {
    await deleteNotification(notificationId);
    getNotificationsData();
  };

  const renderNotification = ({
    item,
  }: ListRenderItemInfo<NotificationResponse>) => {
    return (
      <NotificationsCard
        onPress={() => navigation.navigate(EDIT_NOTIFICATION_SCREEN, item)}
        onDeleteNotification={handleDeleteNotification}
        notification={item}
      />
    );
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
        renderItem={renderNotification}
        extraData={data}
        keyExtractor={getKeyExtractor}
        refreshing={isLoading}
        onRefresh={getNotificationsData}
        ListEmptyComponent={
          <View style={{padding: 24, alignItems: 'center'}}>
            <Text>No notification rules yet</Text>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 80 }}
        style={{ flex: 1 }}
      />
    );
  };

  return (
    <NotificationsManagerContainer testID={E2E_TEST_IDS.screens.notifications}>
      <InfoCard>
        <InfoTitle>Internal alerts are active</InfoTitle>
        <InfoBody>
          These rules now run locally in the app (Notifee) based on live Nightscout glucose,
          with per-rule cooldown to reduce alert spam.
        </InfoBody>
      </InfoCard>
      {renderNotifications()}
      <AddNotificationButton
        callback={() => navigation.navigate(ADD_NOTIFICATION_SCREEN)}
        label={tr(language, 'notificationsUi.addNotification')}
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

const AddNotificationButton: FC<{callback: () => void; label: string}> = ({callback, label}) => {
  return (
    <AddNotificationButtonContainer
      testID={E2E_TEST_IDS.notifications.addButton}
      onPress={callback}>
      <AddNotificationButtonText>{label}</AddNotificationButtonText>
    </AddNotificationButtonContainer>
  );
};

export default NotificationsManager;
