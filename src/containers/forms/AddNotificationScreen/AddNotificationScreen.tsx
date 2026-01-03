/**
 * This screen displays a form to add a new notification
 * all styles are used with styled-components
 * Store management is done with firebase
 * language: typescript
 */
import React, {FC} from 'react';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import {Keyboard} from 'react-native';
import {NotificationRequest} from 'app/types/notifications';
import {useAddNotification} from 'app/hooks/notifications/useAddNotification';
import {
  HOME_TAB_SCREEN,
  NOTIFICATION_TAB_SCREEN,
} from 'app/constants/SCREEN_NAMES';
import NotificationForm from 'app/components/forms/NotificationForm/NotificationForm';
import {
  AddNotificationScreenButton,
  AddNotificationScreenButtonText,
  AddNotificationScreenContainer,
  AddNotificationScreenTitle,
} from './AddNotificationScreen.style';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';

const AddNotificationScreen: FC = () => {

  const navigation = useNavigation<NavigationProp<any>>();
  const {addNotification} = useAddNotification();
  const goBack = () => {
    // Reset to MAIN_TAB_NAVIGATOR and set the initial tab to NotificationTabScreen
    navigation.reset({
      index: 0,
      routes: [
        {
          name: 'HomeScreen',
          params: { screen: 'NotificationTabScreen' },
        },
      ],
    });
  };

  const onSubmit = async (notification: NotificationRequest) => {
    Keyboard.dismiss();

    await addNotification(notification);
    goBack();
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  return (
    <AddNotificationScreenContainer testID={E2E_TEST_IDS.screens.notificationsAdd}>
      <AddNotificationScreenTitle testID={E2E_TEST_IDS.notifications.addTitle}>
        Add Notification
      </AddNotificationScreenTitle>

      <NotificationForm
        onSubmit={onSubmit}
        notification={null}
        submitHandlerRef={submitHandlerRef}
      />
      <AddNotificationScreenButton
        testID={E2E_TEST_IDS.notifications.addSubmit}
        onPress={() => submitHandlerRef?.current?.()}>
        <AddNotificationScreenButtonText>Add</AddNotificationScreenButtonText>
      </AddNotificationScreenButton>
    </AddNotificationScreenContainer>
  );
};

export default AddNotificationScreen;
