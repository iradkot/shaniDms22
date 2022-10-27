/**
 * This screen displays a form to add a new notification
 * all styles are used with styled-components
 * Store management is done with firebase
 * language: typescript
 */
import React, {FC, useState} from 'react';
// @ts-ignore
import styled from 'styled-components/native';
// @ts-ignore
import {Notification} from '../../../types/notifications';
// @ts-ignore
import {useAddNotification} from '../hooks/useAddNotification';
// @ts-ignore
import {useUpdateNotification} from '../hooks/useUpdateNotification';
// @ts-ignore
import {useDeleteNotification} from '../hooks/useDeleteNotification';
import {Trend} from '../types/notifications';

const AddNotificationScreenContainer = styled.View`
  flex: 1;
  background-color: #fff;
`;

const AddNotificationScreenTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  margin: 10px;
`;

const AddNotificationScreenInput = styled.TextInput`
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 10px;
  margin: 10px;
`;

const AddNotificationScreenSwitch = styled.Switch`
  margin: 10px;
`;

const AddNotificationScreenButton = styled.TouchableOpacity`
  background-color: #ccc;
  padding: 10px;
  margin: 10px;
  border-radius: 5px;
`;

const AddNotificationScreenText = styled.Text`
  font-size: 18px;
`;
const AddNotificationScreenButtonText = styled(AddNotificationScreenText)`
  text-align: center;
`;
const AddNotificationScreenInputLabel = styled(AddNotificationScreenText)`
  margin-left: 10px;
`;

const AddNotificationScreen: FC = () => {
  const [name, setName] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [hour_from_in_minutes, setHourFromInMinutes] = useState(0);
  const [hour_to_in_minutes, setHourToInMinutes] = useState(0);
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
    });
  };

  const handleUpdateNotification = (notification: Notification) => {
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

  const handleDeleteNotification = (notification: Notification) => {
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

      <AddNotificationScreenInputLabel>
        Hour from in minutes
      </AddNotificationScreenInputLabel>
      <AddNotificationScreenInput
        placeholder="Hour from in minutes"
        value={hour_from_in_minutes.toString()}
        onChangeText={setHourFromInMinutes}
      />
      <AddNotificationScreenInputLabel>
        Hour to in minutes
      </AddNotificationScreenInputLabel>
      <AddNotificationScreenInput
        placeholder="Hour to in minutes"
        value={hour_to_in_minutes.toString()}
        onChangeText={setHourToInMinutes}
      />
      <AddNotificationScreenInputLabel>
        Range start
      </AddNotificationScreenInputLabel>
      <AddNotificationScreenInput
        placeholder="Range start"
        value={range_start.toString()}
        onChangeText={setRangeStart}
      />
      <AddNotificationScreenInputLabel>
        Range end
      </AddNotificationScreenInputLabel>
      <AddNotificationScreenInput
        placeholder="Range end"
        value={range_end.toString()}
        onChangeText={setRangeEnd}
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
