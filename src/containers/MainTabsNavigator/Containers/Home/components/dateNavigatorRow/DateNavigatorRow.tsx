import React, {FC, useState} from 'react';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import {
  ButtonContainer,
  Container,
  DateButton,
  DateText,
  IconContainer,
} from './DateNavigatorRow.style';

interface DateNavigatorRowProps {
  date: Date;
  isToday: boolean;
  onGoBack: () => void;
  onGoForward: () => void;
  resetToCurrentDate: () => void;
  setCustomDate: (date: Date) => void;
}

export const DateNavigatorRow: FC<DateNavigatorRowProps> = ({
  date,
  isToday,
  onGoBack,
  onGoForward,
  resetToCurrentDate,
  setCustomDate,
}) => {
  const [isDateModalVisible, setIsDateModalVisible] = useState(false);

  const onPickerConfirm = (newDate: Date) => {
    setCustomDate(newDate);
    setIsDateModalVisible(false);
  };
  return (
    <Container>
      <ButtonContainer flex={0.5} />
      <ButtonContainer onPress={onGoBack} active={isToday} flex={2}>
        <LinearGradient
          colors={['#333', '#666']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={{borderRadius: 10, padding: 5}}>
          <IconContainer>
            <Icon name="ios-arrow-back" size={20} color="#fff" />
          </IconContainer>
        </LinearGradient>
      </ButtonContainer>
      <DateButton onPress={() => setIsDateModalVisible(true)}>
        <DateText>{date.toDateString()}</DateText>
      </DateButton>
      <DateTimePickerModal
        date={date}
        isVisible={isDateModalVisible}
        mode="date"
        is24Hour={true}
        maximumDate={new Date()}
        onConfirm={onPickerConfirm}
        onCancel={() => setIsDateModalVisible(false)}
      />
      <ButtonContainer onPress={onGoForward} disabled={isToday} flex={2}>
        <LinearGradient
          colors={['#333', '#666']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={{borderRadius: 10, padding: 5}}>
          <IconContainer>
            <Icon name="ios-arrow-forward" size={20} color="#fff" />
          </IconContainer>
        </LinearGradient>
      </ButtonContainer>
      <ButtonContainer
        onPress={resetToCurrentDate}
        disabled={isToday}
        flex={0.5}>
        <LinearGradient
          colors={['#333', '#666']}
          start={{x: 0, y: 0}}
          end={{x: 1, y: 0}}
          style={{borderRadius: 10, padding: 5}}>
          <IconContainer>
            <Icon name="ios-refresh" size={20} color="#fff" />
          </IconContainer>
        </LinearGradient>
      </ButtonContainer>
    </Container>
  );
};

export default DateNavigatorRow;
