// /Trends/components/DateRangeSelector.tsx
import React, {useMemo, useState} from 'react';
import DateTimePickerModal from 'react-native-modal-datetime-picker';
import styled from 'styled-components/native';

import {
  MetricButton,
  MetricButtonText,
  ExplanationText,
} from '../styles/Trends.styles';

interface Props {
  presetDays: number;
  onPresetDaysChange: (days: number) => void;

  startDate: Date;
  endDate: Date;
  onStartDateChange: (date: Date) => void;
  onEndDateChange: (date: Date) => void;
}

type PickerType = 'start' | 'end' | null;

export const DateRangeSelector: React.FC<Props> = ({
  presetDays,
  onPresetDaysChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}) => {
  const [activePicker, setActivePicker] = useState<PickerType>(null);

  const today = useMemo(() => new Date(), []);
  const startLabel = useMemo(() => startDate.toLocaleDateString(), [startDate]);
  const endLabel = useMemo(() => endDate.toLocaleDateString(), [endDate]);

  return (
    <Container>
      <PresetRow>
        <MetricButton selected={presetDays === 7} onPress={() => onPresetDaysChange(7)}>
          <MetricButtonText>7 Days</MetricButtonText>
        </MetricButton>
        <MetricButton selected={presetDays === 14} onPress={() => onPresetDaysChange(14)}>
          <MetricButtonText>14 Days</MetricButtonText>
        </MetricButton>
        <MetricButton selected={presetDays === 30} onPress={() => onPresetDaysChange(30)}>
          <MetricButtonText>30 Days</MetricButtonText>
        </MetricButton>
      </PresetRow>

      <CustomRow>
        <RangeButton onPress={() => setActivePicker('start')}>
          <RangeButtonText>From: {startLabel}</RangeButtonText>
        </RangeButton>
        <RangeButton onPress={() => setActivePicker('end')}>
          <RangeButtonText>To: {endLabel}</RangeButtonText>
        </RangeButton>
      </CustomRow>

      <HelpText>Or pick exact dates</HelpText>

      <DateTimePickerModal
        isVisible={activePicker === 'start'}
        date={startDate}
        mode="date"
        maximumDate={endDate > today ? today : endDate}
        onConfirm={date => {
          setActivePicker(null);
          onStartDateChange(date);
        }}
        onCancel={() => setActivePicker(null)}
      />

      <DateTimePickerModal
        isVisible={activePicker === 'end'}
        date={endDate}
        mode="date"
        minimumDate={startDate}
        maximumDate={today}
        onConfirm={date => {
          setActivePicker(null);
          onEndDateChange(date);
        }}
        onCancel={() => setActivePicker(null)}
      />
    </Container>
  );
};

const Container = styled.View`
  margin-vertical: 10px;
`;

const PresetRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: 8px;
`;

const CustomRow = styled.View`
  flex-direction: row;
  justify-content: center;
`;

const HelpText = styled(ExplanationText)`
  text-align: center;
  margin-top: 6px;
`;

const RangeButton = styled.TouchableOpacity`
  padding: 8px 12px;
  border-radius: 5px;
  margin: 0 5px;
  background-color: ${({theme}) => theme.buttonBackgroundColor};
`;

const RangeButtonText = styled.Text`
  color: ${({theme}) => theme.buttonTextColor};
  font-weight: bold;
`;
