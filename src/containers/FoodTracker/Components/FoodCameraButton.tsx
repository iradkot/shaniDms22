import React from 'react';
import {View, Text} from 'react-native';
import styled from 'styled-components/native';
import {ADD_FOOD_ITEM_SCREEN} from 'app/constants/SCREEN_NAMES';
import {NavigationProp} from '@react-navigation/native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import {Theme} from 'app/types/theme';
import Button from 'app/components/Button/Button';

const FoodCameraButton: React.FC<{navigation: NavigationProp<any>}> = ({
  navigation,
}) => {
  const handlePress = () => {
    navigation.navigate(ADD_FOOD_ITEM_SCREEN);
  };
  return (
    <Button
      onClick={handlePress}
      text="Add Food"
      icon={<CameraIcon name="camera-alt" size={30} color="white" />}
    />
  );
};

const CameraIcon = styled(MaterialIcons)`
  margin-right: 10px;
`;
export default FoodCameraButton;
