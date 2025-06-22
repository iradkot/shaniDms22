/**
 * This is the screen that allows the user to edit a notification.
 * All styles are used with styled-components
 * Store management is done with firebase
 * language: typescript
 */
import React, {FC} from 'react';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import {Keyboard} from 'react-native';
import {
  NotificationRequest,
  NotificationResponse,
} from 'app/types/notifications';
import {useUpdateNotification} from 'app/hooks/notifications/useUpdateNotification';
import {
  HOME_TAB_SCREEN,
  NOTIFICATION_TAB_SCREEN,
} from 'app/constants/SCREEN_NAMES';

import {
  AddNotificationScreenButton,
  AddNotificationScreenButtonText,
  AddNotificationScreenContainer,
  AddNotificationScreenTitle,
} from 'app/containers/forms/AddNotificationScreen/AddNotificationScreen.style';
import NotificationForm from 'app/components/forms/NotificationForm/NotificationForm';

const EditNotificationScreen: FC = (props: any) => {

  const navigation = useNavigation<NavigationProp<any>>();
  // get the notification from the navigation params
  const notification = props.route.params as NotificationResponse;
  const {updateNotification} = useUpdateNotification();
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

  const onSubmit = async (updatedNotification: NotificationRequest) => {
    Keyboard.dismiss();
    await updateNotification({...notification, ...updatedNotification});
    goBack();
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  return (
    <AddNotificationScreenContainer>
      <AddNotificationScreenTitle>Edit Notification</AddNotificationScreenTitle>

      <NotificationForm
        onSubmit={onSubmit}
        notification={notification}
        submitHandlerRef={submitHandlerRef}
      />
      <AddNotificationScreenButton
        onPress={() => submitHandlerRef?.current?.()}>
        <AddNotificationScreenButtonText>Edit</AddNotificationScreenButtonText>
      </AddNotificationScreenButton>
    </AddNotificationScreenContainer>
  );
};

export default EditNotificationScreen;
