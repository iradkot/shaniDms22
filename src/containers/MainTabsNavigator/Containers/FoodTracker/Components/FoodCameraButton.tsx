import React from 'react';
import {View, Text} from 'react-native';
import styled from 'styled-components/native';
import {ADD_FOOD_ITEM_SCREEN} from 'app/constants/SCREEN_NAMES';
import {NavigationProp} from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import {Theme} from 'app/types/theme';
import Button from 'app/components/Button/Button';
import {formattedFoodItemDTO} from 'app/types/food.types';

const FoodCameraButton: React.FC<{
  navigation: NavigationProp<any>;
  setFsFoodItems: (foodItems: formattedFoodItemDTO[]) => void;
}> = ({navigation, setFsFoodItems}) => {
  const handlePress = () => {
    navigation.navigate(ADD_FOOD_ITEM_SCREEN, {setFsFoodItems: setFsFoodItems});
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
