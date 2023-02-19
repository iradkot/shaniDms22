import React from 'react';
import {View, Text} from 'react-native';
import styled from 'styled-components/native';
import {ADD_FOOD_ITEM_SCREEN} from 'app/constants/SCREEN_NAMES';
import {NavigationProp} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {Theme} from 'app/types/theme';

const FoodCameraButton: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  return (
    <ButtonContainer
      disabled={false}
      onPress={() => navigation.navigate(ADD_FOOD_ITEM_SCREEN)}>
      <CameraIcon name="camera" size={25} color="white" />
      <ButtonText>Take a picture</ButtonText>
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

const CameraIcon = styled(MaterialIcons)`
  margin-right: 10px;
`;

const ButtonText = styled(Text)`
  font-size: 18px;
  color: white;
`;

export default FoodCameraButton;
