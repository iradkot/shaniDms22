import React, {FC} from 'react';
import {Alert, Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import {useToggleNotification} from 'app/hooks/notifications/useToggleNotification';
import {NotificationResponse} from 'app/types/notifications';
import {formatMinutesToLocaleTimeString} from 'app/utils/datetime.utils';
import {
  DeleteButton,
  DeleteButtonContainer,
  DeleteButtonText,
  NotificationCardContainer,
  NotificationCardDetails,
  NotificationCardRow,
  NotificationCardText,
  NotificationEnableSwitch,
  NotificationSwitchContainer,
  NotificationTitle,
} from './NotificationCard.style';
import Loader from 'app/components/common-ui/Loader/Loader';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

type ContextType = {
  translateX: number;
  translateY: number;
};

interface NotificationCardProp {
  onPress: () => void;
  notification: NotificationResponse;
  onDeleteNotification: (notificationId: string) => void;
}

export const NotificationsCard: FC<NotificationCardProp> = ({
  onPress,
  notification,
  onDeleteNotification,
}) => {
  const {toggleNotification, isEnabled, isLoading} = useToggleNotification(
    notification.enabled,
  );
  const {language} = useAppLanguage();

  const handleDeleteNotification = () => {
    onDeleteNotification(notification.id);
  };

  const renderDeleteButton = () => {
    return (
      <DeleteButtonContainer>
        <DeleteButton onPress={openDeleteAlert}>
          <DeleteButtonText>
            <Icon name="trash" size={20} color="red" />
          </DeleteButtonText>
        </DeleteButton>
      </DeleteButtonContainer>
    );
  };

  const handleToggle = () => {
    toggleNotification(notification);
  };

  const openDeleteAlert = () => {
    Alert.alert(
      tr(language, 'notifications.deleteTitle'),
      tr(language, 'notifications.deleteBody'),
      [
        {
          text: tr(language, 'common.cancel'),
          onPress: () => {},
        },
        {
          text: tr(language, 'settings.delete'),
          onPress: handleDeleteNotification,
        },
      ],
    );
  };

  return (
    <NotificationCardContainer
      onTouchEnd={onPress}
      activeOpacity={0.9}
      style={{ flex: 1 }}
    >
      <NotificationCardDetails>
        <NotificationCardRow>
          <NotificationTitle numberOfLines={1} ellipsizeMode="tail">
            {notification.name}
          </NotificationTitle>
        </NotificationCardRow>
        <NotificationCardRow>
          <NotificationCardText>Time:</NotificationCardText>
          <NotificationCardText>
            {formatMinutesToLocaleTimeString(notification.hour_from_in_minutes)}
            {' - '}
            {formatMinutesToLocaleTimeString(notification.hour_to_in_minutes)}
          </NotificationCardText>
        </NotificationCardRow>
        <NotificationCardRow>
          <NotificationCardText>Range:</NotificationCardText>
          <NotificationCardText>
            {notification.range_start} - {notification.range_end}
          </NotificationCardText>
        </NotificationCardRow>
        <NotificationCardRow>
          <NotificationCardText>Trend:</NotificationCardText>
          <NotificationCardText>
            {require('app/components/DirectionArrows').default ? (
              React.createElement(require('app/components/DirectionArrows').default, {
                trendDirection: notification.trend,
                size: 24,
                color: '#1976d2',
              })
            ) : null}
          </NotificationCardText>
        </NotificationCardRow>
      </NotificationCardDetails>
      <NotificationSwitchContainer>
        {isLoading ? (
          <Loader />
        ) : (
          <NotificationEnableSwitch
            value={isEnabled}
            onValueChange={handleToggle}
          />
        )}
      </NotificationSwitchContainer>
      <DeleteButtonContainer>
        <DeleteButton onPress={openDeleteAlert} accessibilityLabel="Delete notification">
          <DeleteButtonText>
            <Icon name="trash" size={20} color="red" />
          </DeleteButtonText>
        </DeleteButton>
      </DeleteButtonContainer>
    </NotificationCardContainer>
  );
};
