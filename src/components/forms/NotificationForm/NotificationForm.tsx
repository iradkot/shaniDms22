// FIX: Hooks must be called inside a function component, not at the top level
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
  const [showTrendInfo, setShowTrendInfo] = React.useState(false);
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
  const nameRef = React.useRef<any>(null);
  const range_start_ref = React.useRef<any>(null);
  const range_end_ref = React.useRef<any>(null);

  interface InputControllerProps {
    ref: React.RefObject<TextInput>;
    name: 'name' | 'range_start' | 'range_end';
    placeholder: string;
    keyboardType: KeyboardType;
    returnKeyType: ReturnKeyType;
    onSubmitEditing: () => void;
    rules: any;
  }

  const InputComponents: Array<InputControllerProps & { label: string }> = [
    {
      ref: nameRef,
      name: 'name',
      label: 'Notification Name',
      placeholder: 'Enter name',
      keyboardType: 'default',
      returnKeyType: 'next',
      onSubmitEditing: () => range_start_ref.current?.focus(),
      rules: rules.name,
    },
    {
      ref: range_start_ref,
      name: 'range_start',
      label: 'Range Start',
      placeholder: 'e.g. 80',
      keyboardType: 'number-pad',
      returnKeyType: 'next',
      onSubmitEditing: () => range_end_ref.current?.focus(),
      rules: rules.range,
    },
    {
      ref: range_end_ref,
      name: 'range_end',
      label: 'Range End',
      placeholder: 'e.g. 180',
      keyboardType: 'number-pad',
      returnKeyType: 'done',
      onSubmitEditing: () => range_end_ref?.current?.blur(),
      rules: rules.range,
    },
  ];
  return (
    <S.Container>
      {/* Toggle enabled/disabled */}
      <Controller
        control={control}
        name="enabled"
        render={({ field: { value, onChange } }) => (
          <S.ToggleContainer>
            <S.ToggleButton
              selected={value}
              onPress={() => onChange(!value)}
            >
              <S.ToggleButtonText selected={value}>
                {value ? 'Enabled' : 'Disabled'}
              </S.ToggleButtonText>
            </S.ToggleButton>
          </S.ToggleContainer>
        )}
      />
      {InputComponents.map(input => (
        <S.InputWrapper key={input.name}>
          <S.InputLabel>{input.label}</S.InputLabel>
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
                `${input.label} is required`}
              {errors?.[input.name]?.type === 'minLength' &&
                `${input.label} must be at least 3 characters`}
              {errors?.[input.name]?.type === 'maxLength' &&
                `${input.label} must be at most 50 characters`}
              {errors?.[input.name]?.type === 'min' &&
                `${input.label} must be at least 1`}
              {errors?.[input.name]?.type === 'max' &&
                `${input.label} must be at most 1000`}
              {errors?.[input.name]?.type === 'pattern' &&
                `${input.label} must be a number`}
            </S.ErrorText>
          )}
        </S.InputWrapper>
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
      {/* Trend selector with info icon and description */}
      <S.InputWrapper>
        <S.InputLabel style={{flexDirection: 'row', alignItems: 'center'}}>
          Trend
          <S.InfoIconTouchable onPress={() => setShowTrendInfo(prev => !prev)}>
            <S.InfoIcon>i</S.InfoIcon>
          </S.InfoIconTouchable>
        </S.InputLabel>
        {showTrendInfo && (
          <S.TrendInfoBox>
            <S.TrendInfoText>
              The trend determines when this notification will trigger:
              {'\n'}
              <S.TrendInfoBullet>•</S.TrendInfoBullet> <S.Bold>Down</S.Bold>: Only when glucose is falling fast or slow.
              {'\n'}
              <S.TrendInfoBullet>•</S.TrendInfoBullet> <S.Bold>Up</S.Bold>: Only when glucose is rising fast or slow.
              {'\n'}
              <S.TrendInfoBullet>•</S.TrendInfoBullet> <S.Bold>Flat</S.Bold>: Trend is ignored, triggers at any direction.
            </S.TrendInfoText>
          </S.TrendInfoBox>
        )}
        <Controller
          control={control}
          name="trend"
          rules={rules.trend}
          defaultValue="Flat"
          render={({ field: { onChange, value } }) => (
            <S.TrendSelectorScroll horizontal showsHorizontalScrollIndicator={false}>
              {[
                { label: 'Double Down', value: 'DoubleDown' },
                { label: 'Single Down', value: 'SingleDown' },
                { label: 'FortyFive Down', value: 'FortyFiveDown' },
                { label: 'Flat', value: 'Flat' },
                { label: 'FortyFive Up', value: 'FortyFiveUp' },
                { label: 'Single Up', value: 'SingleUp' },
                { label: 'Double Up', value: 'DoubleUp' },
              ].map(opt => (
                <S.TrendOptionButton
                  key={opt.value}
                  selected={value === opt.value}
                  onPress={() => onChange(opt.value as TrendDirectionString)}
                >
                  <S.TrendIconWrapper>
                    {require('app/components/DirectionArrows').default ? (
                      React.createElement(require('app/components/DirectionArrows').default, {
                        trendDirection: opt.value,
                        size: 32,
                        color: value === opt.value ? '#1976d2' : '#888',
                      })
                    ) : null}
                  </S.TrendIconWrapper>
                </S.TrendOptionButton>
              ))}
            </S.TrendSelectorScroll>
          )}
        />
      </S.InputWrapper>
      {errors.trend && <S.ErrorText>Trend is required.</S.ErrorText>}
    </S.Container>
  );
};

export default NotificationForm;
