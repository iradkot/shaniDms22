import React, {FC} from 'react';
import {Alert, Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/FontAwesome';
import {useToggleNotification} from 'app/hooks/useToggleNotification';
import {NotificationResponse} from 'app/types/notifications';
import {formatMinutesToLocaleTimeString} from 'app/utils/datetime.utils';
import {
  NotificationEnableSwitch,
  NotificationCardContainer,
  NotificationTitle,
  NotificationCardText,
  NotificationCardDetails,
  NotificationCardRow,
  NotificationSwitchContainer,
  DeleteButton,
  DeleteButtonText,
  DeleteButtonContainer,
} from './NotificationCard.style';

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
  const {toggleNotification, isEnabled} = useToggleNotification(
    notification.enabled,
  );

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
      'Delete this notification?',
      'Are you sure you want to delete?',
      [
        {
          text: 'Cancel',
          onPress: () => {},
        },
        {
          text: 'Delete',
          onPress: handleDeleteNotification,
        },
      ],
    );
  };

  return (
    <Pressable onPress={onPress}>
      <View>
        <NotificationCardContainer onPress={onPress} activeOpacity={1}>
          <NotificationCardDetails>
            <NotificationCardRow>
              <NotificationTitle>{notification.name}</NotificationTitle>
            </NotificationCardRow>
            <NotificationCardRow>
              {/*  Display the hour_from_in_minutes and hour_to_in_minutes in a more readable format*/}
              <NotificationCardText>Notification hour:</NotificationCardText>
              <NotificationCardText>
                {formatMinutesToLocaleTimeString(
                  notification.hour_from_in_minutes,
                )}{' '}
                -{' '}
                {formatMinutesToLocaleTimeString(
                  notification.hour_to_in_minutes,
                )}
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
              onValueChange={handleToggle}
            />
          </NotificationSwitchContainer>
        </NotificationCardContainer>
      </View>
      {renderDeleteButton()}
    </Pressable>
  );
};
