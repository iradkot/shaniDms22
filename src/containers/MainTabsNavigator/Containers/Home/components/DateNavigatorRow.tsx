import React, {FC} from 'react';
import styled from 'styled-components/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {TouchableOpacity} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

const Container = styled.View`
  height: 100px;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  border-radius: 10px;
  background-color: white;
  padding: 10px;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 4;
  elevation: 2;
`;

const ButtonContainer = styled(TouchableOpacity)<{
  disabled?: boolean;
  active?: boolean;
  flex?: number;
}>`
  justify-content: center;
  align-items: center;
  ${props => (props.flex ? `flex: ${props.flex}` : 'flex: 1')};
  ${props => props.disabled && 'opacity: 0.5;'}
  ${props => props.active && 'border-radius: 10px;'}
  ${props => props.active && 'margin: 5px;'}
  ${props => props.active && 'padding: 5px;'}
  ${props => props.active && 'box-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);'}
  ${props => props.active && 'transition: 0.3s;'}
  ${props => props.active && '&:hover { transform: scale(1.1); }'}
  ${props => !props.active && 'padding-left: 10px;'}
  ${props => !props.active && 'padding-right: 10px;'}
`;
const IconContainer = styled.View`
  width: 30px;
  height: 30px;
  border-radius: 15px;
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
      <DateText>{date.toDateString()}</DateText>
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
