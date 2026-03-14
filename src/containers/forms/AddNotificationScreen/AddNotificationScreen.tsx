/**
 * This screen displays a form to add a new notification
 * all styles are used with styled-components
 * Store management is done with firebase
 * language: typescript
 */
import React, {FC} from 'react';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import {Alert, Keyboard, Platform, ToastAndroid} from 'react-native';
import {NotificationRequest} from 'app/types/notifications';
import {useAddNotification} from 'app/hooks/notifications/useAddNotification';
import {
  MAIN_TAB_NAVIGATOR,
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
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

const AddNotificationScreen: FC = () => {

  const navigation = useNavigation<NavigationProp<any>>();
  const {addNotification} = useAddNotification();
  const {language} = useAppLanguage();
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const showStatus = (message: string) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(message, ToastAndroid.SHORT);
      return;
    }
    Alert.alert(message);
  };
  const goBack = () => {
    // Reset to MAIN_TAB_NAVIGATOR and set the initial tab to NotificationTabScreen
    navigation.reset({
      index: 0,
      routes: [
        {
          name: MAIN_TAB_NAVIGATOR,
          params: {screen: NOTIFICATION_TAB_SCREEN},
        },
      ],
    });
  };

  const onSubmit = async (notification: NotificationRequest) => {
    if (isSubmitting) return;
    Keyboard.dismiss();
    setIsSubmitting(true);
    try {
      await addNotification(notification);
      showStatus(tr(language, 'notificationScreens.addSuccess'));
      goBack();
    } catch (e: any) {
      Alert.alert(
        tr(language, 'notificationScreens.saveErrorTitle'),
        e?.message ?? '',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  return (
    <AddNotificationScreenContainer testID={E2E_TEST_IDS.screens.notificationsAdd}>
      <AddNotificationScreenTitle testID={E2E_TEST_IDS.notifications.addTitle}>
        {tr(language, 'notificationScreens.addTitle')}
      </AddNotificationScreenTitle>

      <NotificationForm
        onSubmit={onSubmit}
        notification={null}
        submitHandlerRef={submitHandlerRef}
      />
      <AddNotificationScreenButton
        testID={E2E_TEST_IDS.notifications.addSubmit}
        disabled={isSubmitting}
        style={{opacity: isSubmitting ? 0.6 : 1}}
        onPress={() => submitHandlerRef?.current?.()}>
        <AddNotificationScreenButtonText>
          {isSubmitting
            ? tr(language, 'notificationScreens.saving')
            : tr(language, 'notificationScreens.addSubmit')}
        </AddNotificationScreenButtonText>
      </AddNotificationScreenButton>
    </AddNotificationScreenContainer>
  );
};

export default AddNotificationScreen;
