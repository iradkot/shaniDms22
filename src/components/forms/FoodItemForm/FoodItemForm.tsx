import React, {useEffect} from 'react';
import {
  Alert,
  Keyboard,
  TextInput,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  View,
  LayoutChangeEvent,
} from 'react-native';
import {PhotoFile} from 'react-native-vision-camera';
import {NavigationProp, useNavigation} from '@react-navigation/native';
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
import {AddFoodItem} from 'app/types/food.types';

const FoodItemForm = ({
  foodItem,
  onSubmit,
  submitHandlerRef,
}: FoodItemFormProps) => {
  const isEditMode = !!foodItem;
  const navigation = useNavigation<NavigationProp<any>>();
  const [photo, setPhoto] = React.useState<PhotoFile | {uri: string} | undefined>(
    foodItem?.image ? {uri: foodItem.image} : undefined
  );
  const [date, setDate] = React.useState<Date>(() => {
    if (foodItem?.timestamp) {
      const d = new Date(foodItem.timestamp);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

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
    const onSubmitForm = (data: AddFoodItem | EditFoodItem) => {
      if (!photo || !date) {
        Alert.alert(
          'Image Required',
          'Please add an image to submit the form.',
          [{text: 'OK', onPress: () => {}}],
        );
        return;
      }
      let timestamp: number;
      if (isDate(date) && !isNaN(date.getTime())) {
        timestamp = date.getTime();
      } else if (typeof date === 'number') {
        timestamp = date;
      } else {
        timestamp = Date.now();
      }

      const newData = {
        ...data,
        timestamp,
        image: photo,
      };

      if (isEditMode && foodItem) {
        onSubmit({...foodItem, ...newData}, foodItem);
      } else {
        onSubmit(newData, foodItem);
      }
    };
    submitHandlerRef.current = () => handleSubmit(onSubmitForm)();
  }, [handleSubmit, onSubmit, photo, submitHandlerRef, isEditMode, foodItem]);

  useEffect(() => {
    if (!foodItem) {
      navigation.navigate('CameraScreen', {
        onTakePhoto: (picture: PhotoFile) => setPhoto(picture),
      });
    }
  }, [foodItem, navigation]);

  const nameRef = React.useRef<TextInput>(null!);
  const carbsRef = React.useRef<TextInput>(null!);
  const notesRef = React.useRef<TextInput>(null!);

  const InputComponents: InputControllerProps[] = [
    {
      ref: nameRef,
      name: 'name',
      placeholder: 'Name',
      keyboardType: 'default',
      returnKeyType: 'done',
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

  // Handler invoked when a photo is taken; always a PhotoFile
  const onTakePhoto = (picture: PhotoFile) => {
    setPhoto(picture);
  };

  const logLayout = (e: LayoutChangeEvent, componentName: string) => {
    console.log(`${componentName} layout:`, e.nativeEvent.layout);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{flex: 1}}
      onLayout={e => logLayout(e, 'KeyboardAvoidingView')}>
      <ScrollView
        contentContainerStyle={{flexGrow: 1}}
        keyboardShouldPersistTaps="handled"
        onLayout={e => logLayout(e, 'ScrollView')}>
        <S.Container>
          <ImageField
            photo={photo}
            navigation={navigation}
            onTakePhoto={onTakePhoto}
            initialSource={foodItem?.image && {uri: foodItem.image}}
          />
          {/* Log the date value before passing to DateTimePickerCard */}
          {(() => { console.log('FoodItemForm: date state before DateTimePickerCard', date); return null; })()}
          <DateTimePickerCard
            initialTimestamp={(() => {
              if (date && isDate(date) && !isNaN(date.getTime())) return date.getTime();
              if (typeof date === 'number' && !isNaN(date)) return date;
              return Date.now();
            })()}
            onTimestampChange={timestamp => {
              const d = new Date(timestamp);
              if (!isNaN(d.getTime())) {
                setDate(d);
              } else {
                console.warn('FoodItemForm: Invalid timestamp received from DateTimePickerCard', timestamp);
              }
            }}
          />
          {InputComponents.map((input, i) => (
            <Controller
              key={i}
              control={control}
              render={({field: {onChange, value}, fieldState: {isTouched}}) => (
                <View key={input.name}>
                  <S.FormLabel>{input.placeholder}</S.FormLabel>
                  <S.FormInput
                    ref={input.ref}
                    value={value.toString()}
                    placeholder={input.placeholder}
                    keyboardType={input.keyboardType}
                    returnKeyType={input.returnKeyType}
                    onChangeText={(text: string) => {
                      onChange(text);
                      if (isTouched) {
                        console.log(`Input ${input.name} changed:`, text);
                      }
                    }}
                    onSubmitEditing={input.onSubmitEditing}
                    selectTextOnFocus={input.selectTextOnFocus}
                    onLayout={(e: LayoutChangeEvent) => logLayout(e, `Input ${input.name}`)}
                  />
                </View>
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
          <S.ButtonContainer>
            <S.SubmitButton onPress={() => submitHandlerRef.current?.()}>
              <S.SubmitButtonText>Submit</S.SubmitButtonText>
            </S.SubmitButton>
          </S.ButtonContainer>
        </S.Container>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

export default FoodItemForm;
