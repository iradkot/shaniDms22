import React, {FC} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Ionicons';

const Container = styled.View`
  height: 50px;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  border-radius: 10px;
  background-color: white;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 4;
  elevation: 2;
`;

const ButtonContainer = styled.TouchableOpacity<{disabled: boolean}>`
  flex: 1;
  justify-content: center;
  align-items: center;
  ${props => props.disabled && 'opacity: 0.5;'}
`;

const IconContainer = styled.View`
  width: 30px;
  height: 30px;
  border-radius: 15px;
  background-color: aliceblue;
  justify-content: center;
  align-items: center;
`;

const DateText = styled.Text`
  flex: 4;
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  color: #333;
`;

interface DateNavigatorRowProps {
  date: Date;
  onGoBack: () => void;
  onGoForward: () => void;
  resetToCurrentDate: () => void;
}

export const DateNavigatorRow: FC<DateNavigatorRowProps> = ({
  date,
  onGoBack,
  onGoForward,
  resetToCurrentDate,
}) => {
  const isToday = new Date().toDateString() === date.toDateString();
  return (
    <Container>
      <ButtonContainer />
      <ButtonContainer onPress={onGoBack}>
        <IconContainer>
          <Icon name="ios-arrow-back" size={20} color="#333" />
        </IconContainer>
      </ButtonContainer>
      <DateText>{date.toDateString()}</DateText>
      <ButtonContainer onPress={onGoForward} disabled={isToday}>
        <IconContainer>
          <Icon name="ios-arrow-forward" size={20} color="#333" />
        </IconContainer>
      </ButtonContainer>
      <ButtonContainer onPress={resetToCurrentDate} disabled={isToday}>
        <IconContainer>
          <Icon name="ios-refresh" size={20} color="#333" />
        </IconContainer>
      </ButtonContainer>
    </Container>
  );
};

export default DateNavigatorRow;
