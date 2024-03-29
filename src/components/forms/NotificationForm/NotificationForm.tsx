/* eslint-disable @typescript-eslint/no-unused-vars */
import {Controller, useForm} from 'react-hook-form';
import * as S from 'app/components/forms/NotificationForm/NotificationForm.styles';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

import {
  NotificationRequest,
  TrendDirectionString,
} from 'app/types/notifications';
import React, {MutableRefObject, useEffect, useState} from 'react';
import {
  formatMinutesToLocaleTimeString,
  getTimeInMinutes,
} from 'app/utils/datetime.utils';
import {KeyboardType, ReturnKeyType, TextInput} from 'react-native';
import {rules} from 'app/components/forms/rules/NotificationForm.rules';

type Props = {
  notification: NotificationRequest | null;
  onSubmit: (notification: NotificationRequest) => Promise<void>;
  submitHandlerRef: MutableRefObject<null | (() => void)>;
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

  const [isHourFromPickerVisible, setIsHourFromPickerVisible] = useState(false);
  const [isHourToPickerVisible, setIsHourToPickerVisible] = useState(false);

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
  const nameRef = React.useRef<TextInput>(null);
  const range_start_ref = React.useRef<TextInput>(null);
  const range_end_ref = React.useRef<TextInput>(null);

  interface InputControllerProps {
    ref: React.RefObject<TextInput>;
    name: 'name' | 'range_start' | 'range_end';
    placeholder: string;
    keyboardType: KeyboardType;
    returnKeyType: ReturnKeyType;
    onSubmitEditing: () => void;
    rules: any;
  }

  const InputComponents: InputControllerProps[] = [
    {
      ref: nameRef,
      name: 'name',
      placeholder: 'Name',
      keyboardType: 'default',
      returnKeyType: 'next',
      onSubmitEditing: () => range_start_ref.current?.focus(),
      rules: rules.name,
    },
    {
      ref: range_start_ref,
      name: 'range_start',
      placeholder: 'Range start',
      keyboardType: 'number-pad',
      returnKeyType: 'next',
      onSubmitEditing: () => range_end_ref.current?.focus(),
      rules: rules.range,
    },
    {
      ref: range_end_ref,
      name: 'range_end',
      placeholder: 'Range end',
      keyboardType: 'number-pad',
      returnKeyType: 'done',
      onSubmitEditing: () => range_end_ref?.current?.blur(),
      rules: rules.range,
    },
  ];
  return (
    <S.Container>
      {InputComponents.map(input => (
        <React.Fragment key={input.name}>
          <Controller
            key={input.name}
            control={control}
            name={input.name}
            rules={input.rules}
            render={({field: {onChange, onBlur, value}}) => (
              <S.TextInput
                ref={input.ref}
                placeholder={input.placeholder}
                keyboardType={input.keyboardType}
                returnKeyType={input.returnKeyType}
                onSubmitEditing={input.onSubmitEditing}
                onBlur={onBlur}
                onChangeText={onChange}
                value={value}
              />
            )}
          />
          {errors?.[input.name] && (
            <S.ErrorText>
              {errors?.[input.name]?.type === 'required' &&
                `${input.name} is required`}
              {errors?.[input.name]?.type === 'minLength' &&
                `${input.name} must be at least 3 characters`}
              {errors?.[input.name]?.type === 'maxLength' &&
                `${input.name} must be at most 50 characters`}
              {errors?.[input.name]?.type === 'min' &&
                `${input.name} must be at least 1`}
              {errors?.[input.name]?.type === 'max' &&
                `${input.name} must be at most 1000`}
              {errors?.[input.name]?.type === 'pattern' &&
                `${input.name} must be a number`}
            </S.ErrorText>
          )}
        </React.Fragment>
      ))}
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
              isVisible={isHourFromPickerVisible}
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
              isVisible={isHourToPickerVisible}
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
              onValueChange={(value: TrendDirectionString) => onChange(value)}
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
