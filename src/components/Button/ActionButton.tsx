import React from 'react';
import styled from 'styled-components/native';

export const ActionButton: React.FC<{
  onPress: () => void;
  text: string;
  isLoading: boolean;
}> = ({onPress, text, isLoading}) => {
  if (isLoading) {
    return (
      <ActionButtonContainer>
        <LoadingIndicator size="large" color="#fff" />
      </ActionButtonContainer>
    );
  } else {
    return (
      <ActionButtonContainer onPress={onPress}>
        <ActionButtonText>{text}</ActionButtonText>
      </ActionButtonContainer>
    );
  }
};

const BUTTON_SIZE = 100;
// create a bottom right circled action button
const ActionButtonContainer = styled.TouchableOpacity`
  position: absolute;
  bottom: 40px;
  right: 20px;
  width: ${BUTTON_SIZE}px;
  height: ${BUTTON_SIZE}px;
  border-radius: ${BUTTON_SIZE / 2}px;
  background-color: #000;
  justify-content: center;
  align-items: center;
  z-index: 100;
`;

const ActionButtonText = styled.Text`
  color: #fff;
  font-size: ${BUTTON_SIZE / 4}px;
`;

//create loading indicator
const LoadingIndicator = styled.ActivityIndicator`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  justify-content: center;
  align-items: center;
`;
