import {Controller, useForm} from 'react-hook-form';
import * as S from 'app/components/forms/NotificationForm/NotificationForm.styles';
import DateTimePickerModal from 'react-native-modal-datetime-picker';

import {
  NotificationRequest,
  TrendDirectionString,
} from 'app/types/notifications';
import React, {MutableRefObject, useEffect, useMemo, useState} from 'react';
import {
  formatMinutesToLocaleTimeString,
  getTimeInMinutes,
} from 'app/utils/datetime.utils';
import {KeyboardType, ReturnKeyType, TextInput} from 'react-native';
import {rules} from 'app/components/forms/rules/NotificationForm.rules';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

type Props = {
  notification: NotificationRequest | null;
  onSubmit: (notification: NotificationRequest) => Promise<void>;
  submitHandlerRef: MutableRefObject<null | (() => void)>;
};

type InputName = 'name' | 'range_start' | 'range_end';

interface InputControllerProps {
  ref: React.RefObject<TextInput>;
  name: InputName;
  label: string;
  placeholder: string;
  keyboardType: KeyboardType;
  returnKeyType: ReturnKeyType;
  onSubmitEditing: () => void;
  rules: any;
}

const TREND_OPTIONS: Array<{label: string; value: TrendDirectionString}> = [
  {label: 'Double Down', value: 'DoubleDown'},
  {label: 'Single Down', value: 'SingleDown'},
  {label: '45 Down', value: 'FortyFiveDown'},
  {label: 'Flat', value: 'Flat'},
  {label: '45 Up', value: 'FortyFiveUp'},
  {label: 'Single Up', value: 'SingleUp'},
  {label: 'Double Up', value: 'DoubleUp'},
];

function getErrorText(type: string | undefined, label: string, language: 'en' | 'he') {
  if (!type) return '';
  switch (type) {
    case 'required':
      return tr(language, 'notificationForm.errRequired', {label});
    case 'minLength':
      return tr(language, 'notificationForm.errMinLength', {label});
    case 'maxLength':
      return tr(language, 'notificationForm.errMaxLength', {label});
    case 'min':
      return tr(language, 'notificationForm.errMin', {label});
    case 'max':
      return tr(language, 'notificationForm.errMax', {label});
    case 'pattern':
      return tr(language, 'notificationForm.errNumber', {label});
    default:
      return '';
  }
}

const NotificationForm = ({
  notification,
  onSubmit,
  submitHandlerRef,
}: Props) => {
  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();
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
    submitHandlerRef.current = () => handleSubmit(onSubmitForm)();
  }, [handleSubmit, onSubmit, submitHandlerRef]);

  const nameRef = React.useRef<any>(null);
  const rangeStartRef = React.useRef<any>(null);
  const rangeEndRef = React.useRef<any>(null);

  const inputComponents: InputControllerProps[] = useMemo(
    () => [
      {
        ref: nameRef,
        name: 'name',
        label: tr(language, 'notificationForm.nameLabel'),
        placeholder: tr(language, 'notificationForm.namePlaceholder'),
        keyboardType: 'default',
        returnKeyType: 'next',
        onSubmitEditing: () => rangeStartRef.current?.focus(),
        rules: rules.name,
      },
      {
        ref: rangeStartRef,
        name: 'range_start',
        label: tr(language, 'notificationForm.rangeStartLabel'),
        placeholder: tr(language, 'notificationForm.rangeStartPlaceholder'),
        keyboardType: 'number-pad',
        returnKeyType: 'next',
        onSubmitEditing: () => rangeEndRef.current?.focus(),
        rules: rules.range,
      },
      {
        ref: rangeEndRef,
        name: 'range_end',
        label: tr(language, 'notificationForm.rangeEndLabel'),
        placeholder: tr(language, 'notificationForm.rangeEndPlaceholder'),
        keyboardType: 'number-pad',
        returnKeyType: 'done',
        onSubmitEditing: () => rangeEndRef.current?.blur(),
        rules: rules.range,
      },
    ],
    [language],
  );

  return (
    <S.Container>
      <Controller
        control={control}
        name="enabled"
        render={({field: {value, onChange}}) => (
          <S.ToggleContainer>
            <S.ToggleButton selected={value} onPress={() => onChange(!value)}>
              <S.ToggleButtonText selected={value}>
                {value
                  ? tr(language, 'notificationForm.enabled')
                  : tr(language, 'notificationForm.disabled')}
              </S.ToggleButtonText>
            </S.ToggleButton>
          </S.ToggleContainer>
        )}
      />

      {inputComponents.map(input => (
        <S.InputWrapper key={input.name}>
          <S.InputLabel>{input.label}</S.InputLabel>
          <Controller
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
                onChangeText={text => {
                  if (input.keyboardType === 'number-pad') {
                    const n = Number(text.replace(/[^0-9.]/g, ''));
                    onChange(Number.isFinite(n) ? n : 0);
                    return;
                  }
                  onChange(text);
                }}
                value={String(value ?? '')}
              />
            )}
          />
          {errors?.[input.name] && (
            <S.ErrorText>
              {getErrorText(errors?.[input.name]?.type, input.label, language)}
            </S.ErrorText>
          )}
        </S.InputWrapper>
      ))}

      {errors.hour_from_in_minutes && (
        <S.ErrorText>{tr(language, 'notificationForm.hourFromRequired')}</S.ErrorText>
      )}
      <Controller
        control={control}
        name="hour_from_in_minutes"
        rules={rules.timeInMinutes}
        defaultValue={0}
        render={({field: {onChange, value}}) => (
          <S.TimePickerContainer>
            <S.TimePickerButton onPress={() => setIsHourFromPickerVisible(true)}>
              <S.TimePickerText>
                {tr(language, 'notificationForm.from', {
                  time: formatMinutesToLocaleTimeString(value),
                })}
              </S.TimePickerText>
            </S.TimePickerButton>
            <DateTimePickerModal
              date={new Date(0, 0, 0, 0, value)}
              isVisible={isHourFromPickerVisible}
              mode="time"
              is24Hour
              onConfirm={date => {
                onChange(getTimeInMinutes(date));
                setIsHourFromPickerVisible(false);
              }}
              onCancel={() => setIsHourFromPickerVisible(false)}
            />
          </S.TimePickerContainer>
        )}
      />

      {errors.hour_to_in_minutes && (
        <S.ErrorText>{tr(language, 'notificationForm.hourToRequired')}</S.ErrorText>
      )}
      <Controller
        control={control}
        name="hour_to_in_minutes"
        rules={rules.timeInMinutes}
        defaultValue={0}
        render={({field: {onChange, value}}) => (
          <S.TimePickerContainer>
            <S.TimePickerButton onPress={() => setIsHourToPickerVisible(true)}>
              <S.TimePickerText>
                {tr(language, 'notificationForm.to', {
                  time: formatMinutesToLocaleTimeString(value),
                })}
              </S.TimePickerText>
            </S.TimePickerButton>
            <DateTimePickerModal
              date={new Date(0, 0, 0, 0, value)}
              isVisible={isHourToPickerVisible}
              mode="time"
              is24Hour
              onConfirm={date => {
                onChange(getTimeInMinutes(date));
                setIsHourToPickerVisible(false);
              }}
              onCancel={() => setIsHourToPickerVisible(false)}
            />
          </S.TimePickerContainer>
        )}
      />

      <S.InputWrapper>
        <S.InputLabel style={{flexDirection: 'row', alignItems: 'center'}}>
          {tr(language, 'notificationForm.trendLabel')}
          <S.InfoIconTouchable onPress={() => setShowTrendInfo(prev => !prev)}>
            <S.InfoIcon>i</S.InfoIcon>
          </S.InfoIconTouchable>
        </S.InputLabel>
        {showTrendInfo && (
          <S.TrendInfoBox>
            <S.TrendInfoText>{tr(language, 'notificationForm.trendInfo')}</S.TrendInfoText>
          </S.TrendInfoBox>
        )}

        <Controller
          control={control}
          name="trend"
          rules={rules.trend}
          defaultValue="Flat"
          render={({field: {onChange, value}}) => (
            <S.TrendSelectorScroll horizontal showsHorizontalScrollIndicator={false}>
              {TREND_OPTIONS.map(opt => (
                <S.TrendOptionButton
                  key={opt.value}
                  selected={value === opt.value}
                  onPress={() => onChange(opt.value)}>
                  <S.TrendIconWrapper>
                    {require('app/components/DirectionArrows').default
                      ? React.createElement(require('app/components/DirectionArrows').default, {
                          trendDirection: opt.value,
                          size: 32,
                          color:
                            value === opt.value
                              ? theme.accentColor
                              : addOpacity(theme.textColor, 0.55),
                        })
                      : null}
                  </S.TrendIconWrapper>
                </S.TrendOptionButton>
              ))}
            </S.TrendSelectorScroll>
          )}
        />
      </S.InputWrapper>

      {errors.trend && <S.ErrorText>{tr(language, 'notificationForm.trendRequired')}</S.ErrorText>}
    </S.Container>
  );
};

export default NotificationForm;
