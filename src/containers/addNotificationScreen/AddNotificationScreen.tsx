/**
 * This screen displays a form to add a new notification
 * all styles are used with styled-components
 * Store management is done with firebase
 * language: typescript
 */
import React, {FC, useState} from 'react';
import {
  NotificationRequest,
  NotificationResponse,
} from '../../types/notifications';
import {useAddNotification} from '../../hooks/useAddNotification';
import {useUpdateNotification} from '../../hooks/useUpdateNotification';
import {useDeleteNotification} from '../../hooks/useDeleteNotification';
import {Trend} from '../../types/notifications';
import DateTimePicker from '@react-native-community/datetimepicker';
import {Keyboard} from 'react-native';
import {
  AddNotificationScreenButton,
  AddNotificationScreenButtonText,
  AddNotificationScreenContainer,
  AddNotificationScreenInput,
  AddNotificationScreenInputLabel,
  AddNotificationScreenSwitch,
  AddNotificationScreenText,
  AddNotificationScreenTitle,
} from './AddNotificationScreen.style';

const AddNotificationScreen: FC = () => {
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [hour_from_in_minutes, setHourFromInMinutes] = useState(0);
  const [is_hour_from_picker_visible, setIsHourFromPickerVisible] =
    useState(false);
  const [hour_to_in_minutes, setHourToInMinutes] = useState(0);
  const [is_hour_to_picker_visible, setIsHourToPickerVisible] = useState(false);
  const [range_start, setRangeStart] = useState(0);
  const [range_end, setRangeEnd] = useState(0);
  const [trend, setTrend] = useState<Trend>('Flat');

  const {addNotification} = useAddNotification();
  const {updateNotification} = useUpdateNotification();
  const {deleteNotification} = useDeleteNotification();

  const handleAddNotification = () => {
    addNotification({
      name,
      enabled,
      hour_from_in_minutes,
      hour_to_in_minutes,
      range_start,
      range_end,
      trend,
    } as NotificationRequest);
  };

  const handleUpdateNotification = (notification: NotificationResponse) => {
    updateNotification({
      ...notification,
      name,
      enabled,
      hour_from_in_minutes,
      hour_to_in_minutes,
      range_start,
      range_end,
      trend,
    });
  };

  const handleDeleteNotification = (notification: NotificationResponse) => {
    deleteNotification(notification);
  };

  return (
    <AddNotificationScreenContainer>
      <AddNotificationScreenTitle>Add Notification</AddNotificationScreenTitle>

      <AddNotificationScreenInputLabel>
        Notification name
      </AddNotificationScreenInputLabel>
      <AddNotificationScreenInput
        placeholder="Name"
        value={name}
        onChangeText={setName}
      />

      <AddNotificationScreenInputLabel>
        Enable notification
      </AddNotificationScreenInputLabel>
      <AddNotificationScreenSwitch value={enabled} onValueChange={setEnabled} />
      <AddNotificationScreenButton
        onPress={() => {
          setIsHourFromPickerVisible(prev => !prev);
        }}>
        <AddNotificationScreenText>
          {/*The time from which the notification will be sent in hh:mm format*/}
          {`From: ${Math.floor(hour_from_in_minutes / 60)}:${(
            hour_from_in_minutes % 60
          )
            .toString()
            .padStart(2, '0')}`}
        </AddNotificationScreenText>
      </AddNotificationScreenButton>
      {is_hour_from_picker_visible && (
        <DateTimePicker
          value={new Date(0, 0, 0, 0, hour_from_in_minutes)}
          mode="time"
          is24Hour={true}
          display="default"
          onChange={(event, date) => {
            if (date) {
              setHourFromInMinutes(date.getMinutes());
              setIsHourFromPickerVisible(false);
            }
          }}
        />
      )}
      <AddNotificationScreenButton
        onPress={() => {
          setIsHourToPickerVisible(prev => !prev);
        }}>
        <AddNotificationScreenText>
          {/*The time until which the notification will be sent in hh:mm format*/}
          {`To: ${Math.floor(hour_to_in_minutes / 60)}:${(
            hour_to_in_minutes % 60
          )
            .toString()
            .padStart(2, '0')}`}
        </AddNotificationScreenText>
      </AddNotificationScreenButton>
      {is_hour_to_picker_visible && (
        <DateTimePicker
          value={new Date(0, 0, 0, 0, hour_to_in_minutes)}
          mode="time"
          is24Hour={true}
          display="default"
          onChange={(event, date) => {
            if (date) {
              setHourToInMinutes(date.getHours() * 60 + date.getMinutes());
              setIsHourToPickerVisible(false);
            }
          }}
        />
      )}
      <AddNotificationScreenInputLabel>
        Range start
      </AddNotificationScreenInputLabel>
      <AddNotificationScreenInput
        placeholder="Range start"
        value={range_start.toString()}
        onChangeText={setRangeStart}
        keyboardType="numeric"
        onPressDone={() => {
          Keyboard.dismiss();
        }}
      />
      <AddNotificationScreenInputLabel>
        Range end
      </AddNotificationScreenInputLabel>
      <AddNotificationScreenInput
        placeholder="Range end"
        value={range_end.toString()}
        onChangeText={setRangeEnd}
        keyboardType="numeric"
      />
      <AddNotificationScreenInputLabel>Trend</AddNotificationScreenInputLabel>
      <AddNotificationScreenInput
        placeholder="Trend"
        value={trend}
        onChangeText={setTrend}
      />
      <AddNotificationScreenButton onPress={handleAddNotification}>
        <AddNotificationScreenButtonText>Add</AddNotificationScreenButtonText>
      </AddNotificationScreenButton>
    </AddNotificationScreenContainer>
  );
};

export default AddNotificationScreen;
