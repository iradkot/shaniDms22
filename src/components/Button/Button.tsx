import React from 'react';
import {Theme} from 'app/types/theme';
import styled from 'styled-components/native';

const Button: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  icon?: React.ReactNode;
  text: string;
}> = ({onClick, disabled, isLoading, icon, text}) => {
  return (
    <ButtonContainer disabled={disabled} onPress={onClick}>
      {icon}
      <ButtonText>{text}</ButtonText>
    </ButtonContainer>
  );
};

const ButtonContainer = styled.TouchableOpacity<{
  disabled?: boolean;
  theme: Theme;
}>`
  background-color: ${({disabled, theme}) =>
    disabled ? theme.textColor : theme.accentColor};
  border-radius: 25px;
  padding: 5px;
  margin: 10px;
  width: 170px;
  height: 50px;
  justify-content: center;
  align-items: center;
  flex-direction: row;
  position: absolute;
  bottom: 0;
  right: 0;
`;

const ButtonText = styled.Text`
  font-size: 18px;
  color: white;
`;

export default Button;
