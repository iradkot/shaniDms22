import {Controller, useForm} from 'react-hook-form';
import styled from 'styled-components/native';
import React, {MutableRefObject, useEffect} from 'react';
import {SportItemDTO} from 'app/types/sport.types';
import {Theme} from 'app/types/theme';

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
  const {
    control,
    handleSubmit,
    formState: {errors},
  } = useForm<SportItemDTO>({
    defaultValues: {
      name: sportItem?.name || '',
      durationMinutes: sportItem?.durationMinutes || 0,
      intensity: sportItem?.intensity || 0,
      timestamp: sportItem?.timestamp || 0,
    },
  });

  useEffect(() => {
    submitHandlerRef.current = () => handleSubmit(onSubmit);
  }, [handleSubmit, onSubmit, submitHandlerRef]);

  return (
    <Container>
      <Controller
        control={control}
        name="name"
        rules={rules.name}
        render={({field: {onChange, value}}) => (
          <FormInput
            placeholder="Name"
            onChangeText={text => onChange(text)}
            value={value}
            error={errors.name?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="durationMinutes"
        rules={rules.durationMinutes}
        render={({field: {onChange, value}}) => (
          <FormInput
            placeholder="Duration (minutes)"
            onChangeText={text => onChange(text)}
            value={value}
            error={errors.durationMinutes?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="intensity"
        rules={rules.intensity}
        render={({field: {onChange, value}}) => (
          <FormInput
            placeholder="Intensity"
            onChangeText={text => onChange(text)}
            value={value.toString()}
            error={errors.intensity?.message}
          />
        )}
      />
    </Container>
  );
};

const Container = styled.View<{theme: Theme}>`
  flex: 1;
  background-color: ${({theme}) => theme.backgroundColor};
  padding: ${({theme}) => theme.dimensions.width * 0.05}px;
`;

const FormInput = styled.TextInput`
  border: 1px solid #ccc;
  border-radius: 5px;
  padding: 10px;
  margin-bottom: 10px;
`;

const rules = {
  name: {
    required: 'Name is required',
  },
  durationMinutes: {
    required: 'Duration is required',
    min: {
      value: 1,
      message: 'Duration must be at least 1 minute',
    },
    max: {
      value: 1440,
      message: 'Duration must be at most 1440 minutes',
    },
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
