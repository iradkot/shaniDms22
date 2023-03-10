import React, {FC} from 'react';
import {useNavigation} from '@react-navigation/native';
import {Keyboard} from 'react-native';
import {AddFoodItem, useAddFoodItem} from 'app/hooks/foods/useAddFoodItem';
import {
  ADD_FOOD_ITEM_SCREEN,
  HOME_TAB_SCREEN,
} from 'app/constants/SCREEN_NAMES';
import FoodItemForm from 'app/components/forms/FoodItemForm/FoodItemForm';
import styled from 'styled-components/native';
import {Theme} from 'app/types/theme';

const AddFoodItemScreen: FC = () => {
  const navigation = useNavigation();
  const {addFoodItem} = useAddFoodItem();
  const goBack = () => {
    navigation.reset({
      index: 1,
      // @ts-ignore
      routes: [{name: HOME_TAB_SCREEN}, {name: ADD_FOOD_ITEM_SCREEN}],
    });
    navigation.goBack();
  };

  const onSubmit = async (foodItem: AddFoodItem) => {
    Keyboard.dismiss();
    await addFoodItem(foodItem);
    goBack();
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  return (
    <AddFoodItemScreenContainer>
      {/*<CameraScreen onTakePhoto={(picture: string) => setPicture(picture)} />*/}
      <FoodItemForm
        onSubmit={onSubmit}
        foodItem={null}
        submitHandlerRef={submitHandlerRef}
      />
      <AddFoodItemScreenButton onPress={() => submitHandlerRef.current?.()}>
        <AddFoodItemScreenButtonText>Add</AddFoodItemScreenButtonText>
      </AddFoodItemScreenButton>
    </AddFoodItemScreenContainer>
  );
};

export const AddFoodItemScreenContainer = styled.ScrollView<{theme: Theme}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
`;

export const AddFoodItemScreenTitle = styled.Text`
  font-size: 20px;
  font-weight: bold;
  margin: 10px;
`;

export const AddFoodItemScreenButton = styled.TouchableOpacity`
  background-color: #ccc;
  padding: 10px;
  margin: 10px;
  border-radius: 5px;
`;

export const AddFoodItemScreenButtonText = styled.Text`
  font-size: 18px;
  text-align: center;
`;

export default AddFoodItemScreen;
