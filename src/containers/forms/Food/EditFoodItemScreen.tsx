import React, {FC} from 'react';
import {useNavigation, useRoute} from '@react-navigation/native';
import {Keyboard, Text} from 'react-native';
import {EditFoodItem, useEditFoodItem} from 'app/hooks/foods/useEditFoodItem';
import {
  Food_Tracking_TAB_SCREEN,
  HOME_TAB_SCREEN,
} from 'app/constants/SCREEN_NAMES';
import FoodItemForm from 'app/components/forms/FoodItemForm/FoodItemForm';
import styled from 'styled-components/native';
import {Theme} from 'app/types/theme';
import Loader from 'app/components/common-ui/Loader/Loader';

const EditFoodItemScreen: FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {setFsFoodItems, foodItem} = route.params as any;

  console.log('foodItem id', foodItem.id);

  const {editFoodItem} = useEditFoodItem();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const goBack = () => {
    navigation.reset({
      index: 1,
      // @ts-ignore
      routes: [{name: HOME_TAB_SCREEN}, {name: Food_Tracking_TAB_SCREEN}],
    });
    navigation.goBack();
  };

  const onSubmit = async (foodItem: EditFoodItem, foodItemFromProps: any) => {
    setIsLoading(true);
    Keyboard.dismiss();

    // Check if the image has changed
    const imageChanged = foodItem.image !== foodItemFromProps.image;

    try {
      const savedFoodItem = await editFoodItem(foodItem, imageChanged);
      setFsFoodItems?.((prev: any) => [...prev, savedFoodItem]);
      setIsLoading(false);
      goBack();
    } catch (e: any) {
      setIsLoading(false);
      setError(e.message);
    }
  };

  const submitHandlerRef = React.useRef<null | (() => void)>(null);

  return (
    <EditFoodItemScreenContainer>
      {error && <Text>{error}</Text>}
      {/*<CameraScreen onTakePhoto={(picture: string) => setPicture(picture)} />*/}
      <FoodItemForm
        onSubmit={onSubmit}
        foodItem={foodItem}
        submitHandlerRef={submitHandlerRef}
      />
      {isLoading && <Loader />}
      <EditFoodItemScreenButton
        onPress={() => (isLoading ? null : submitHandlerRef.current?.())}>
        <EditFoodItemScreenButtonText>
          {isLoading ? 'Loading...' : 'Edit'}
        </EditFoodItemScreenButtonText>
      </EditFoodItemScreenButton>
    </EditFoodItemScreenContainer>
  );
};

/// Use theme from here - src/style/theme.ts

const EditFoodItemScreenContainer = styled.View<{theme: Theme}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
  padding: 20px;
`;

const EditFoodItemScreenButton = styled.TouchableOpacity<{theme: Theme}>`
  background-color: ${({theme}) => theme.buttonBackgroundColor};
  padding: 10px;
  border-radius: 5px;
  margin-top: 20px;
`;

const EditFoodItemScreenButtonText = styled.Text<{theme: Theme}>`
  color: ${({theme}) => theme.buttonTextColor};
  text-align: center;
`;

export default EditFoodItemScreen;
