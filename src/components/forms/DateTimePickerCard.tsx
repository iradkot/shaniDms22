// Theme is available via DefaultTheme extension; remove explicit import
import {formatDateToDateAndTimeString} from 'app/utils/datetime.utils';
import React, {useState} from 'react';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import styled from 'styled-components/native';
import DropShadow from 'react-native-drop-shadow';
import {addOpacity} from 'app/style/styling.utils';

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
  // Always ensure pickedTimestamp is a valid number
  const safeInitialTimestamp = typeof initialTimestamp === 'number' && !isNaN(initialTimestamp) && initialTimestamp > 0
    ? initialTimestamp
    : Date.now();
  const [pickedTimestamp, setPickedTimestamp] = useState<number>(safeInitialTimestamp);

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
    if (newTimestamp instanceof Date && !isNaN(newTimestamp.getTime())) {
      setPickedTimestamp(newTimestamp.getTime());
      onTimestampChange(newTimestamp.getTime());
    } else {
      console.warn('DateTimePickerCard: Invalid date in handleConfirmDate', date, newTimestamp);
    }
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
    if (newTimestamp instanceof Date && !isNaN(newTimestamp.getTime())) {
      setPickedTimestamp(newTimestamp.getTime());
      onTimestampChange(newTimestamp.getTime());
    } else {
      console.warn('DateTimePickerCard: Invalid time in handleConfirmTime', time, newTimestamp);
    }
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
      <DropShadow style={{
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.18,
        shadowRadius: 1,
        elevation: 1,
      }}>
        <StyledCard>
          <StyledPickedDateTimeText style={textStyles ?? {}}>
            {label ? `${label}: ` : 'Picked Date & Time: '}
            {formatDateToDateAndTimeString(pickedTimestamp)}
            {(() => { console.log('DateTimePickerCard: pickedTimestamp', pickedTimestamp); return null; })()}
          </StyledPickedDateTimeText>
        </StyledCard>
      </DropShadow>
      <DateTimePickerModal
        isVisible={isDatePickerVisible}
        date={new Date(pickedTimestamp)}
        mode="date"
        onConfirm={handleConfirmDate}
        onCancel={hideDatePicker}
      />
      <DateTimePickerModal
        isVisible={isTimePickerVisible}
        date={new Date(pickedTimestamp)}
        mode="time"
        onConfirm={handleConfirmTime}
        onCancel={hideTimePicker}
      />
    </StyledContainer>
  );
};

const StyledContainer = styled.View`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const StyledPickedDateTimeText = styled.Text`
  font-size: ${props => props.theme.textSize};
  color: ${props => props.theme.textColor};
  margin: 10px 0;
`;

const StyledButtonGroup = styled.View`
  flex-direction: row;
  justify-content: center;
  align-items: center;
`;

const StyledButton = styled.TouchableOpacity`
  background-color: ${props => props.theme.buttonBackgroundColor};
  padding: 10px 20px;
  border-radius: 5px;
  margin: 0 5px;
`;

const StyledButtonText = styled.Text`
  font-size: ${props => props.theme.textSize};
  color: ${props => props.theme.buttonTextColor};
`;

const StyledCard = styled.View`
  background-color: ${({theme}) => addOpacity(theme.backgroundColor, 0.9)};
  padding: 10px;
  border-radius: 5px;
  margin: 5px 0;
`;
export default DateTimePickerCard;
