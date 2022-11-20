/* eslint-disable @typescript-eslint/no-unused-vars */
import {Controller, useForm} from 'react-hook-form';
import * as S from './NotificationForm.styles';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

import {NotificationRequest, Trend} from 'app/types/notifications';
import React, {useEffect, useState, MutableRefObject} from 'react';
import {
  formatMinutesToLocaleTimeString,
  getTimeInMinutes,
} from 'app/utils/datetime.utils';

type Props = {
  notification: NotificationRequest | null;
  onSubmit: (notification: NotificationRequest) => void;
  submitHandlerRef: MutableRefObject<null | (() => void)>;
};

const rules = {
  range: {
    required: true,
    min: 1,
    max: 1000,
    pattern: /^\d+$/,
  },
  name: {
    required: true,
    minLength: 3,
    maxLength: 50,
  },
  timeInMinutes: {
    required: true,
    min: 0,
    max: 1440,
    // pattern to allow only numbers
    pattern: /^\d+$/,
  },
  trend: {
    required: true,
  },
};

const NotificationForm = ({
  notification,
  onSubmit,
  submitHandlerRef,
}: Props) => {
  const {
    control,
    handleSubmit,
    formState: {errors},
  } = useForm<NotificationRequest>({
    defaultValues: {
      name: notification?.name || '',
      enabled: notification?.enabled || false,
      range_start: notification?.range_start || 0,
      range_end: notification?.range_end || 0,
      hour_from_in_minutes: notification?.hour_from_in_minutes || 0,
      hour_to_in_minutes: notification?.hour_to_in_minutes || 0,
      trend: notification?.trend || 'Flat',
    },
  });

  const [is_hour_from_picker_visible, setIsHourFromPickerVisible] =
    useState(false);
  const [is_hour_to_picker_visible, setIsHourToPickerVisible] = useState(false);

  useEffect(() => {
    const onSubmitForm = (data: NotificationRequest) => {
      onSubmit(data);
    };
    submitHandlerRef.current = () => {
      return handleSubmit(onSubmitForm)();
    };
  }, [handleSubmit, onSubmit, submitHandlerRef]);

  // define refs to access the form values
  // ref type is MutableRefObject<any>
  const nameRef = React.useRef<React.RefObject<typeof S.TextInput>>(null);
  const range_start_ref =
    React.useRef<React.RefObject<typeof S.TextInput>>(null);
  const range_end_ref = React.useRef<React.RefObject<typeof S.TextInput>>(null);
  const hour_from_in_minutes_ref =
    React.useRef<React.RefObject<typeof S.TextInput>>(null);
  const hour_to_in_minutes_ref =
    React.useRef<React.RefObject<typeof S.TextInput>>(null);
  const trend_ref = React.useRef<React.RefObject<typeof S.TextInput>>(null);

  return (
    <S.Container>
      <Controller
        control={control}
        render={({
          field: {onChange, onBlur, value},
          fieldState: {invalid, isTouched, isDirty, error},
        }) => (
          <S.TextInput
            ref={nameRef}
            onSubmitEditing={() => {
              // @ts-ignore
              return range_start_ref?.current?.focus();
            }}
            returnKeyType="next"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            placeholder="Name"
          />
        )}
        name="name"
        rules={rules.name}
        defaultValue=""
      />
      {errors.name && <S.ErrorText>Name is required.</S.ErrorText>}
      <Controller
        control={control}
        render={({
          field: {onChange, onBlur, value},
          fieldState: {invalid, isTouched, isDirty, error},
        }) => (
          <S.TextInput
            ref={range_start_ref}
            onSubmitEditing={() => {
              // @ts-ignore
              return range_end_ref?.current?.focus();
            }}
            returnKeyType="next"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            placeholder="Range Start"
          />
        )}
        name="range_start"
        rules={rules.range}
        defaultValue={0}
      />
      {errors.range_start && (
        <S.ErrorText>Range Start is required.</S.ErrorText>
      )}
      <Controller
        control={control}
        render={({
          field: {onChange, onBlur, value},
          fieldState: {invalid, isTouched, isDirty, error},
        }) => (
          <S.TextInput
            ref={range_end_ref}
            onSubmitEditing={() => {
              // @ts-ignore
              return hour_from_in_minutes_ref?.current?.focus();
            }}
            returnKeyType="next"
            onBlur={onBlur}
            onChangeText={onChange}
            value={value}
            placeholder="Range End"
          />
        )}
        name="range_end"
        rules={rules.range}
        defaultValue={0}
      />
      {errors.range_end && <S.ErrorText>Range End is required.</S.ErrorText>}
      {errors.hour_from_in_minutes && (
        <S.ErrorText>Hour From is required.</S.ErrorText>
      )}
      <Controller
        control={control}
        render={({
          field: {onChange, onBlur, value},
          fieldState: {invalid, isTouched, isDirty, error},
        }) => (
          <S.TimePickerContainer>
            <S.TimePickerButton
              onPress={() => setIsHourFromPickerVisible(true)}>
              <S.TimePickerText>
                From {formatMinutesToLocaleTimeString(value)}
              </S.TimePickerText>
            </S.TimePickerButton>
            <DateTimePickerModal
              date={new Date(0, 0, 0, 0, value)}
              isVisible={is_hour_from_picker_visible}
              mode="time"
              is24Hour={true}
              onConfirm={date => {
                onChange(getTimeInMinutes(date));
                setIsHourFromPickerVisible(false);
              }}
              onCancel={() => setIsHourFromPickerVisible(false)}
            />
          </S.TimePickerContainer>
        )}
        name="hour_from_in_minutes"
        rules={rules.timeInMinutes}
        defaultValue={0}
      />
      {errors.hour_to_in_minutes && (
        <S.ErrorText>Hour To is required.</S.ErrorText>
      )}
      <Controller
        control={control}
        render={({
          field: {onChange, onBlur, value},
          fieldState: {invalid, isTouched, isDirty, error},
        }) => (
          <S.TimePickerContainer>
            <S.TimePickerButton onPress={() => setIsHourToPickerVisible(true)}>
              <S.TimePickerText>
                To {formatMinutesToLocaleTimeString(value)}
              </S.TimePickerText>
            </S.TimePickerButton>
            <DateTimePickerModal
              date={new Date(0, 0, 0, 0, value)}
              isVisible={is_hour_to_picker_visible}
              mode="time"
              is24Hour={true}
              onConfirm={date => {
                onChange(getTimeInMinutes(date));
                setIsHourToPickerVisible(false);
              }}
              onCancel={() => setIsHourToPickerVisible(false)}
            />
          </S.TimePickerContainer>
        )}
        name="hour_to_in_minutes"
        rules={rules.timeInMinutes}
        defaultValue={0}
      />
      <Controller
        control={control}
        render={({
          field: {onChange, onBlur, value},
          fieldState: {invalid, isTouched, isDirty, error},
        }) => {
          return (
            <S.Select
              onBlur={onBlur}
              onValueChange={(value: Trend) => onChange(value)}
              selectedValue={value}
              placeholder="Trend">
              <S.SelectItem
                label="Flat"
                value="Flat"
                onPress={() => onChange('Flat')}
                selected={value === 'Flat'}
              />
              <S.SelectItem
                label="Up"
                value="SingleUp"
                onPress={() => onChange('SingleUp')}
                selected={value === 'SingleUp'}
              />
              <S.SelectItem
                label="Down"
                value="SingleDown"
                onPress={() => onChange('SingleDown')}
                selected={value === 'SingleDown'}
              />
              <S.SelectItem
                label="Double Up"
                value="DoubleUp"
                onPress={() => onChange('DoubleUp')}
                selected={value === 'DoubleUp'}
              />
              <S.SelectItem
                label="Double Down"
                value="DoubleDown"
                onPress={() => onChange('DoubleDown')}
                selected={value === 'DoubleDown'}
              />
            </S.Select>
          );
        }}
        name="trend"
        rules={rules.trend}
        defaultValue="Flat"
      />
      {errors.trend && <S.ErrorText>Trend is required.</S.ErrorText>}
    </S.Container>
  );
};

export default NotificationForm;
