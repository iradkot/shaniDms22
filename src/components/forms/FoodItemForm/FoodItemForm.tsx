import React, {useEffect} from 'react';
import {Alert, Keyboard, TextInput} from 'react-native';
import {PhotoFile} from 'react-native-vision-camera';
import {NavigationProp, useNavigation} from '@react-navigation/native';
import {AddFoodItem} from 'app/hooks/foods/useAddFoodItem';
import {Controller, useForm} from 'react-hook-form';
import * as S from 'app/components/forms/FoodItemForm/FoodItemForm.styles';
import DateTimePickerCard from 'app/components/forms/DateTimePickerCard';
import {
  FoodItemFormProps,
  InputControllerProps,
} from 'app/components/forms/FoodItemForm/FoodItemForm.types';
import {rules} from 'app/components/forms/rules/FoodItemForm.Rules';
import {isDate} from 'lodash';
import ImageField from 'app/components/forms/FoodItemForm/components/ImageField';
import {EditFoodItem} from 'app/hooks/foods/useEditFoodItem';

const FoodItemForm = ({
  foodItem,
  onSubmit,
  submitHandlerRef,
}: FoodItemFormProps) => {
  const isEditMode = !!foodItem;
  const navigation = useNavigation<NavigationProp<any>>();
  const [photo, setPhoto] = React.useState<
    PhotoFile | undefined | {uri: PhotoFile}
  >(foodItem?.image ? {uri: foodItem.image} : undefined);
  const [date, setDate] = React.useState<Date | number | undefined>(
    foodItem?.timestamp ?? new Date(),
  );

  const {
    control,
    handleSubmit,
    formState: {errors},
  } = useForm<AddFoodItem | EditFoodItem>({
    defaultValues: {
      name: foodItem?.name || '',
      carbs: foodItem?.carbs || 0,
      notes: foodItem?.notes || '',
      timestamp: foodItem?.timestamp || 0,
    },
  });

  useEffect(() => {
    // this is a workaround to get the form values
    const onSubmitForm = (data: AddFoodItem | EditFoodItem) => {
      if (!photo || !date) {
        Alert.alert(
          'Image Required',
          'Please add an image to submit the form.',
          [
            {
              text: 'OK',
              onPress: () => {},
            },
          ],
        );
        return;
      }
      let timestamp: number;
      if (isDate(date)) {
        timestamp = date.getTime();
      } else {
        timestamp = date;
      }

      const newData = {
        ...data,
        timestamp,
        image: photo,
      };

      if (isEditMode && foodItem) {
        // If it's in edit mode, include the foodItem id and other unchanged properties
        onSubmit({...foodItem, ...newData}, foodItem);
      } else {
        onSubmit(newData, foodItem);
      }
    };
    submitHandlerRef.current = () => handleSubmit(onSubmitForm)();
  }, [handleSubmit, onSubmit, photo, submitHandlerRef, isEditMode, foodItem]);

  useEffect(() => {
    if (!foodItem) {
      // open camera first step when adding a new food item
      navigation.navigate('CameraScreen', {
        onTakePhoto: (picture: PhotoFile) => setPhoto(picture),
      });
    }
  }, [foodItem, navigation]);

  const nameRef = React.useRef<TextInput>(null);
  const carbsRef = React.useRef<TextInput>(null);
  const notesRef = React.useRef<TextInput>(null);

  const InputComponents: InputControllerProps[] = [
    {
      ref: nameRef,
      name: 'name',
      placeholder: 'Name',
      keyboardType: 'default',
      returnKeyType: 'done',
      // onSubmitEditing: () => carbsRef.current?.focus(),
      onSubmitEditing: () => Keyboard.dismiss(),
      rules: rules.name,
    },
    {
      ref: carbsRef,
      name: 'carbs',
      placeholder: 'Carbs',
      keyboardType: 'numeric',
      returnKeyType: 'next',
      onSubmitEditing: () => notesRef.current?.focus(),
      rules: rules.carbs,
      selectTextOnFocus: true,
    },
  ];
  const onTakePhoto = (photo: PhotoFile | undefined) => {
    setPhoto(photo);
  };

  return (
    <>
      <ImageField
        photo={photo}
        navigation={navigation}
        onTakePhoto={onTakePhoto}
        initialSource={foodItem?.image && {uri: foodItem.image}} // Add this prop to pass the initial image URI
      />
      <DateTimePickerCard
        initialTimestamp={date ? (isDate(date) ? date.getTime() : date) : 0}
        onTimestampChange={timestamp => {
          setDate(new Date(timestamp));
        }}
      />
      {InputComponents.map((input, i) => (
        <Controller
          key={i}
          control={control}
          render={({field: {onChange, value}}) => (
            <S.FormInput
              ref={input.ref}
              value={value.toString()}
              placeholder={input.placeholder}
              keyboardType={input.keyboardType}
              returnKeyType={input.returnKeyType}
              onChangeText={(text: string) => onChange(text)}
              onSubmitEditing={input.onSubmitEditing}
              selectTextOnFocus={input.selectTextOnFocus}
            />
          )}
          name={input.name}
          rules={input.rules}
        />
      ))}
      {Object.keys(errors).length > 0 && (
        <S.FormErrorText>
          {Object.values(errors).map(err => err.message)}
        </S.FormErrorText>
      )}
    </>
  );
};

export default FoodItemForm;
