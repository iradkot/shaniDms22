import {Controller, useForm} from 'react-hook-form';
import styled from 'styled-components/native';
import React, {MutableRefObject, useEffect, useState} from 'react';
import {SportItemDTO} from 'app/types/sport.types';
import {Theme} from 'app/types/theme';
import {ImageBackground, Text, TouchableOpacity} from 'react-native';
import Slider from '@react-native-community/slider';
import {SubmitButton} from 'app/components/forms/SportForm/components/SubmitButton';
import {
  SportTypeButton,
  SportTypesContainer,
} from 'app/components/forms/SportForm/components/SportTypeButton';
import DateTimePickerCard from '../DateTimePickerCard';
import {sportTypeBackground} from 'app/containers/forms/Sport/styles';
import {SPORT_TYPES} from 'app/constants/SPORT';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
interface SportItemFormProps {
  sportItem?: SportItemDTO;
  onSubmit: (data: SportItemDTO) => void;
  submitHandlerRef: MutableRefObject<null | (() => void)>;
}

const SportItemForm = ({
  sportItem,
  onSubmit,
  submitHandlerRef,
}: SportItemFormProps) => {
  const [selectedSportType, setSelectedSportType] = useState<
    SPORT_TYPES.STRENGTH | SPORT_TYPES.AEROBIC
  >(SPORT_TYPES.STRENGTH);

  const {
    control,
    setValue,
    handleSubmit,
    formState: {errors},
  } = useForm<SportItemDTO>({
    defaultValues: {
      name: sportItem?.name || '',
      startTimestamp: sportItem?.startTimestamp || Date.now(),
      endTimestamp: sportItem?.endTimestamp || Date.now(),
      intensity: sportItem?.intensity || 0,
    },
  });

  useEffect(() => {
    submitHandlerRef.current = () => handleSubmit(onSubmit);
    setValue(
      'name',
      selectedSportType === SPORT_TYPES.STRENGTH
        ? SPORT_TYPES.STRENGTH
        : SPORT_TYPES.AEROBIC,
    );
  }, [handleSubmit, onSubmit, submitHandlerRef, selectedSportType, setValue]);

  const durationOptions = [
    {label: '15 minutes', value: 15},
    {label: 'Half an hour', value: 30},
    {label: '45 minutes', value: 45},
    {label: '1 Hour', value: 60},
    {label: '2 Hours', value: 120},
    {label: '4 Hours', value: 240},
    {label: '8 Hours', value: 480},
  ];

  const DurationButton = ({label, value, isSelected, onPress}) => (
    <TouchableOpacity
      onPress={() => {
        onPress();
        setValue('durationMinutes', value);
      }}
      style={[
        styles.durationButton,
        isSelected && styles.durationButtonSelected,
      ]}>
      <Text style={styles.durationButtonText}>{label}</Text>
    </TouchableOpacity>
  );

  const [selectedDuration, setSelectedDuration] = useState<number>(0);

  return (
    <>
      <ImageBackground
        source={sportTypeBackground[selectedSportType]}
        resizeMode="cover"
        style={styles.imageBackground}>
        <Container>
          <Controller
            control={control}
            name="name"
            rules={rules.name}
            render={({field: {onChange, value}}) => (
              <FormInput
                testID={E2E_TEST_IDS.sport.nameInput}
                placeholder="Name"
                onChangeText={text => onChange(text)}
                value={value}
                error={errors.name?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="startTimestamp"
            rules={rules.startTimestamp}
            render={() => (
              <DateTimePickerCard
                label={'Start'}
                initialTimestamp={sportItem?.startTimestamp}
                onTimestampChange={timestamp =>
                  setValue('startTimestamp', timestamp)
                }
              />
            )}
          />
          <Controller
            control={control}
            name="endTimestamp"
            rules={rules.endTimestamp}
            render={() => (
              <DateTimePickerCard
                label={'End'}
                initialTimestamp={sportItem?.endTimestamp}
                onTimestampChange={timestamp =>
                  setValue('endTimestamp', timestamp)
                }
              />
            )}
          />
          <Controller
            control={control}
            name="intensity"
            rules={rules.intensity}
            render={({field: {onChange, value}}) => (
              <>
                <IntensityText>Intensity: {value}</IntensityText>
                <Slider
                  testID={E2E_TEST_IDS.sport.intensitySlider}
                  style={styles.slider}
                  minimumValue={1}
                  maximumValue={10}
                  step={1}
                  value={value}
                  onValueChange={val => onChange(val)}
                  thumbTintColor="white"
                  minimumTrackTintColor="white"
                />
                <SubmitButton
                  testID={E2E_TEST_IDS.sport.submitButton}
                  onPress={handleSubmit(onSubmit)}
                />
              </>
            )}
          />
        </Container>
        <SportTypesContainer>
          <SportTypeButton
            title={SPORT_TYPES.STRENGTH}
            iconName="dumbbell"
            onPress={() => {
              setSelectedSportType(SPORT_TYPES.STRENGTH);
              setValue('name', SPORT_TYPES.STRENGTH);
            }}
            isSelected={selectedSportType === SPORT_TYPES.STRENGTH}
          />
          <SportTypeButton
            title={SPORT_TYPES.AEROBIC}
            iconName="run-fast"
            onPress={() => {
              setSelectedSportType(SPORT_TYPES.AEROBIC);
              setValue('name', SPORT_TYPES.AEROBIC);
            }}
            isSelected={selectedSportType === SPORT_TYPES.AEROBIC}
          />
        </SportTypesContainer>
      </ImageBackground>
    </>
  );
};

const Container = styled.View<{theme: Theme}>`
  flex: 1;
  padding: ${({theme}) => theme.dimensions.width * 0.05}px;
`;

const FormInput = styled.TextInput`
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 10px;
  margin-bottom: 10px;
  background-color: rgba(255, 255, 255, 0.9);
`;

const IntensityText = styled.Text`
  font-size: 18px;
  font-weight: bold;
  margin-bottom: 10px;
  color: #fff;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 10px;
  align-items: center;
  justify-content: center;
  text-align: center;
`;

const DurationOptionsContainer = styled.TouchableOpacity<{
  theme: Theme;
  isSelected: boolean;
}>`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
  margin-bottom: 10px;
  ${({isSelected}) => isSelected && 'background-color: #5b5b5b;'}
`;

const styles = {
  durationButtonSelected: {
    backgroundColor: '#5b5b5b',
  },
  durationButton: {
    backgroundColor: '#3f3f3f',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    width: '48%',
  },
  durationButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  slider: {
    width: '100%',
    height: 40,
  },
  imageBackground: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
};

const rules = {
  name: {
    required: 'Name is required',
  },
  startTimestamp: {
    required: 'Start time is required',
  },
  endTimestamp: {
    required: 'End time is required',
  },
  intensity: {
    required: 'Intensity is required',
    min: {
      value: 1,
      message: 'Intensity must be at least 1',
    },
    max: {
      value: 10,
      message: 'Intensity must be at most 10',
    },
  },
};

export default SportItemForm;
