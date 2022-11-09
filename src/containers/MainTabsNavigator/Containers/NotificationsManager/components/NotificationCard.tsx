import React, {FC} from 'react';
import {View} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedGestureHandler,
  withSpring,
} from 'react-native-reanimated';
import {useToggleNotification} from 'app/hooks/useToggleNotification';
import {NotificationResponse} from 'app/types/notifications';
import {formatMinutesToLocaleTimeString} from 'app/utils/datetime.utils';
import {
  PanGestureHandler,
  PanGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
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

const DISTANCE_FROM_END = 50;
const DELETE_BUTTON_WIDTH = 80;

type ContextType = {
  translateX: number;
  translateY: number;
};

export const NotificationsCard: FC<{notification: NotificationResponse}> = ({
  notification,
}) => {
  const swipeAnimationValue = useSharedValue(0);
  const {toggleNotification, isEnabled} = useToggleNotification(
    notification.enabled,
  );

  const swipeAnimation = useAnimatedStyle(() => {
    return {
      transform: [{translateX: swipeAnimationValue.value}],
    };
  });

  const renderLeftActions = () => {
    return (
      <DeleteButtonContainer>
        <DeleteButton onPress={() => {}}>
          <DeleteButtonText>Archive</DeleteButtonText>
        </DeleteButton>
      </DeleteButtonContainer>
    );
  };

  const onNotificationPress = () => {
    console.log('Pressed');
  };

  const handleToggle = () => {
    toggleNotification(notification);
  };

  const panGestureEvent = useAnimatedGestureHandler<
    PanGestureHandlerGestureEvent,
    ContextType
  >({
    onStart: (event, context) => {
      context.translateX = swipeAnimationValue.value;
    },
    onActive: (event, context) => {
      swipeAnimationValue.value = event.translationX + context.translateX;
    },
    onEnd: () => {
      if (swipeAnimationValue.value > DISTANCE_FROM_END) {
        swipeAnimationValue.value = withSpring(DELETE_BUTTON_WIDTH);
      } else {
        swipeAnimationValue.value = withSpring(0);
      }
    },
  });

  return (
    <View>
      {renderLeftActions()}
      <PanGestureHandler onGestureEvent={panGestureEvent}>
        <Animated.View style={swipeAnimation}>
          <NotificationCardContainer
            onPress={onNotificationPress}
            activeOpacity={1}>
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
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
};
