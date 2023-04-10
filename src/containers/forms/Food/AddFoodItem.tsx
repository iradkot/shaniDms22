import React, {FC} from 'react';
import {useNavigation, useRoute} from '@react-navigation/native';
import {Keyboard, Text} from 'react-native';
import {AddFoodItem, useAddFoodItem} from 'app/hooks/foods/useAddFoodItem';
import {
  ADD_FOOD_ITEM_SCREEN,
  HOME_TAB_SCREEN,
} from 'app/constants/SCREEN_NAMES';
import FoodItemForm from 'app/components/forms/FoodItemForm/FoodItemForm';
import styled from 'styled-components/native';
import {Theme} from 'app/types/theme';
import Loader from 'app/components/common-ui/Loader/Loader';

const AddFoodItemScreen: FC = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {setFsFoodItems} = route.params as any;

  const {addFoodItem} = useAddFoodItem();
  const [isLoading, setIsLoading] = React.useState<boolean>(false);
  const [error, setError] = React.useState<string | null>(null);
  const goBack = () => {
    navigation.reset({
      index: 1,
      // @ts-ignore
      routes: [{name: HOME_TAB_SCREEN}, {name: ADD_FOOD_ITEM_SCREEN}],
    });
    navigation.goBack();
  };

  const onSubmit = async (foodItem: AddFoodItem) => {
    setIsLoading(true);
    Keyboard.dismiss();
    try {
      const savedFoodItem = await addFoodItem(foodItem);
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
    <AddFoodItemScreenContainer>
      {error && <Text>{error}</Text>}
      {/*<CameraScreen onTakePhoto={(picture: string) => setPicture(picture)} />*/}
      <FoodItemForm
        onSubmit={onSubmit}
        foodItem={null}
        submitHandlerRef={submitHandlerRef}
      />
      {isLoading && <Loader />}
      <AddFoodItemScreenButton
        onPress={() => (isLoading ? null : submitHandlerRef.current?.())}>
        <AddFoodItemScreenButtonText>
          {isLoading ? 'Loading...' : 'Add'}
        </AddFoodItemScreenButtonText>
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
