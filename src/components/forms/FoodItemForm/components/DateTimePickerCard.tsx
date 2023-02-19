import {Theme} from 'app/types/theme';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';
import React, {useState} from 'react';
import {TouchableOpacity} from 'react-native';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import styled from 'styled-components/native';

interface Props {
  initialTimestamp?: number;
  onTimestampChange: (timestamp: number) => void;
}

const DateTimePickerCard = ({initialTimestamp, onTimestampChange}: Props) => {
  const [isDatePickerVisible, setDatePickerVisibility] = useState(false);
  const [isTimePickerVisible, setTimePickerVisibility] = useState(false);
  const [pickedTimestamp, setPickedTimestamp] = useState<number | undefined>(
    initialTimestamp || Date.now(),
  );

  const showDatePicker = () => {
    setDatePickerVisibility(true);
  };

  const hideDatePicker = () => {
    setDatePickerVisibility(false);
  };

  const handleConfirmDate = (date: Date) => {
    hideDatePicker();
    showTimePicker();
    setPickedTimestamp(date.getTime());
  };

  const showTimePicker = () => {
    setTimePickerVisibility(true);
  };

  const hideTimePicker = () => {
    setTimePickerVisibility(false);
  };

  const handleConfirmTime = (time: Date) => {
    hideTimePicker();
    onTimestampChange(time.getTime());
    setPickedTimestamp(time.getTime());
  };

  return (
    <StyledContainer>
      <StyledButton onPress={showDatePicker}>
        <StyledButtonText>Show Date-time Picker </StyledButtonText>
      </StyledButton>
      <StyledPickedDateTimeText>
        Picked Date & Time: {formatDateToDateAndTimeString(pickedTimestamp)}
      </StyledPickedDateTimeText>
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        mode="date"
        onConfirm={handleConfirmDate}
        onCancel={hideDatePicker}
      />
      <DateTimePickerModal
        isVisible={isTimePickerVisible}
        mode="time"
        onConfirm={handleConfirmTime}
        onCancel={hideTimePicker}
      />
    </StyledContainer>
  );
};

const StyledContainer = styled.View<{theme: Theme}>`
  flex: 1;
  justify-content: center;
  align-items: center;
  background-color: ${props => props.theme.backgroundColor};
  padding-top: 20px;
`;

const StyledPickedDateTimeText = styled.Text<{theme: Theme}>`
  font-size: ${props => props.theme.textSize}
  color: ${props => props.theme.textColor};
  margin: 10px 0;
`;

const StyledButton = styled.TouchableOpacity<{theme: Theme}>`
  background-color: ${props => props.theme.buttonBackgroundColor};
  padding: 10px 20px;
  border-radius: 5px;
`;

const StyledButtonText = styled.Text<{theme: Theme}>`
  font-size: ${props => props.theme.textSize};
  color: ${props => props.theme.buttonTextColor};
`;

export default DateTimePickerCard;
