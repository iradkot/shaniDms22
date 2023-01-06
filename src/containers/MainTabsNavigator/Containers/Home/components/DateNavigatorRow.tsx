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

const ButtonContainer = styled.TouchableOpacity`
  flex: 1;
  justify-content: center;
  align-items: center;
`;

const DateText = styled.Text`
  text-align: center;
  font-size: 18px;
  font-weight: bold;
  color: #333;
`;

const IconContainer = styled.View`
  width: 30px;
  height: 30px;
  border-radius: 15px;
  background-color: aliceblue;
  justify-content: center;
  align-items: center;
`;

interface DateNavigatorRowProps {
  date: Date;
  onGoBack: () => void;
  onGoForward: () => void;
}

export const DateNavigatorRow: FC<DateNavigatorRowProps> = ({
  date,
  onGoBack,
  onGoForward,
}) => {
  const isToday = new Date().toDateString() === date.toDateString();
  return (
    <Container>
      <ButtonContainer onPress={onGoBack}>
        <IconContainer>
          <Icon name="ios-arrow-back" size={20} color="#333" />
        </IconContainer>
      </ButtonContainer>
      <DateText>{date.toDateString()}</DateText>
      {!isToday ? (
        <ButtonContainer onPress={onGoForward}>
          <IconContainer>
            <Icon name="ios-arrow-forward" size={20} color="#333" />
          </IconContainer>
        </ButtonContainer>
      ) : (
        <ButtonContainer />
      )}
    </Container>
  );
};

export default DateNavigatorRow;
