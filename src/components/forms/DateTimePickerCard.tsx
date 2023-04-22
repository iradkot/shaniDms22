import {Theme} from 'app/types/theme';
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';
import React, {useState} from 'react';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import styled from 'styled-components/native';
import {addOpacity} from 'app/utils/styling.utils';

interface Props {
  initialTimestamp?: number;
  onTimestampChange: (timestamp: number) => void;
  textStyles?: object;
  label?: string;
}

const DateTimePickerCard = ({
  initialTimestamp,
  onTimestampChange,
  textStyles,
  label,
}: Props) => {
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
    const newTimestamp = new Date(pickedTimestamp);
    newTimestamp.setFullYear(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    setPickedTimestamp(newTimestamp.getTime());
    onTimestampChange(newTimestamp.getTime());
  };

  const showTimePicker = () => {
    setTimePickerVisibility(true);
  };

  const hideTimePicker = () => {
    setTimePickerVisibility(false);
  };

  const handleConfirmTime = (time: Date) => {
    hideTimePicker();
    const newTimestamp = new Date(pickedTimestamp);
    newTimestamp.setHours(time.getHours(), time.getMinutes());
    setPickedTimestamp(newTimestamp.getTime());
    onTimestampChange(newTimestamp.getTime());
  };

  return (
    <StyledContainer>
      <StyledButtonGroup>
        <StyledButton onPress={showDatePicker}>
          <StyledButtonText style={textStyles ?? {}}>
            {label ? `${label} Date` : 'Date'}
          </StyledButtonText>
        </StyledButton>
        <StyledButton onPress={showTimePicker}>
          <StyledButtonText style={textStyles ?? {}}>
            {label ? `${label} Time` : 'Time'}
          </StyledButtonText>
        </StyledButton>
      </StyledButtonGroup>
      <StyledCard>
        <StyledPickedDateTimeText style={textStyles ?? {}}>
          {label ? `${label}: ` : 'Picked Date & Time: '}
          {formatDateToDateAndTimeString(pickedTimestamp)}
        </StyledPickedDateTimeText>
      </StyledCard>
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
`;

const StyledPickedDateTimeText = styled.Text<{theme: Theme}>`
  font-size: ${props => props.theme.textSize};
  color: ${props => props.theme.textColor};
  margin: 10px 0;
`;

const StyledButtonGroup = styled.View<{theme: Theme}>`
  flex-direction: row;
  justify-content: center;
  align-items: center;
`;

const StyledButton = styled.TouchableOpacity<{theme: Theme}>`
  background-color: ${props => props.theme.buttonBackgroundColor};
  padding: 10px 20px;
  border-radius: 5px;
  margin: 0 5px;
`;

const StyledButtonText = styled.Text<{theme: Theme}>`
  font-size: ${props => props.theme.textSize};
  color: ${props => props.theme.buttonTextColor};
`;

const StyledCard = styled.View<{theme: Theme}>`
  background-color: ${({theme}) => addOpacity(theme.backgroundColor, 0.9)};
  padding: 10px;
  border-radius: 5px;
  margin: 5px 0;
  shadow-color: #000;
  shadow-offset: 0px 1px;
  shadow-opacity: 0.18;
  shadow-radius: 1;
  elevation: 1;
`;
export default DateTimePickerCard;
