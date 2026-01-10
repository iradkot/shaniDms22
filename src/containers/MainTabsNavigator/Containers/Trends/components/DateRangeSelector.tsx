// /Trends/components/DateRangeSelector.tsx
import React, {useCallback, useMemo} from 'react';
import {Alert} from 'react-native';
import {DateTimePickerAndroid} from '@react-native-community/datetimepicker';
import styled from 'styled-components/native';

import {addOpacity} from 'app/style/styling.utils';
import {E2E_TEST_IDS} from 'app/constants/E2E_TEST_IDS';
import {isE2E} from 'app/utils/e2e';

interface Props {
  presetDays: number;
  onPresetDaysChange: (days: number) => void;

  startDate: Date;
  endDate: Date;
  onStartDateChange: (date: Date) => void;
  onEndDateChange: (date: Date) => void;
}

export const DateRangeSelector: React.FC<Props> = ({
  presetDays,
  onPresetDaysChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}) => {
  const today = useMemo(() => new Date(), []);
  const startLabel = useMemo(() => startDate.toLocaleDateString(), [startDate]);
  const endLabel = useMemo(() => endDate.toLocaleDateString(), [endDate]);

  const addDays = useCallback((date: Date, deltaDays: number) => {
    const next = new Date(date);
    next.setDate(next.getDate() + deltaDays);
    return next;
  }, []);

  const clampDate = useCallback((date: Date, min: Date, max: Date) => {
    const time = Math.min(max.getTime(), Math.max(min.getTime(), date.getTime()));
    return new Date(time);
  }, []);

  const openStartPicker = useCallback(() => {
    if (isE2E) {
      const max = endDate > today ? today : endDate;
      onStartDateChange(clampDate(addDays(startDate, -1), new Date(0), max));
      return;
    }

    try {
      DateTimePickerAndroid.open({
        value: startDate,
        mode: 'date',
        maximumDate: endDate > today ? today : endDate,
        onChange: (event, selectedDate) => {
          if (event?.type !== 'set' || !selectedDate) return;
          onStartDateChange(selectedDate);
        },
      });
    } catch (e) {
      Alert.alert(
        'Date picker unavailable',
        'The native date picker module is not available in this build. Please rebuild the Android app.',
      );
    }
  }, [addDays, clampDate, endDate, onStartDateChange, startDate, today]);

  const openEndPicker = useCallback(() => {
    if (isE2E) {
      onEndDateChange(clampDate(addDays(endDate, 1), startDate, today));
      return;
    }

    try {
      DateTimePickerAndroid.open({
        value: endDate,
        mode: 'date',
        minimumDate: startDate,
        maximumDate: today,
        onChange: (event, selectedDate) => {
          if (event?.type !== 'set' || !selectedDate) return;
          onEndDateChange(selectedDate);
        },
      });
    } catch (e) {
      Alert.alert(
        'Date picker unavailable',
        'The native date picker module is not available in this build. Please rebuild the Android app.',
      );
    }
  }, [addDays, clampDate, endDate, onEndDateChange, startDate, today]);

  return (
    <Container>
      <PillRow>
        <Pill>
          <PillSegment
            testID={E2E_TEST_IDS.trends.dateRangePreset7}
            selected={presetDays === 7}
            onPress={() => onPresetDaysChange(7)}>
            <PillSegmentText selected={presetDays === 7}>7 Days</PillSegmentText>
          </PillSegment>
          <PillSegment
            testID={E2E_TEST_IDS.trends.dateRangePreset14}
            selected={presetDays === 14}
            onPress={() => onPresetDaysChange(14)}>
            <PillSegmentText selected={presetDays === 14}>14 Days</PillSegmentText>
          </PillSegment>
          <PillSegment
            testID={E2E_TEST_IDS.trends.dateRangePreset30}
            selected={presetDays === 30}
            onPress={() => onPresetDaysChange(30)}>
            <PillSegmentText selected={presetDays === 30}>30 Days</PillSegmentText>
          </PillSegment>
        </Pill>
      </PillRow>

      <CustomRow>
        <RangeButton testID={E2E_TEST_IDS.trends.dateRangeFromButton} onPress={openStartPicker}>
          <RangeButtonText>From: {startLabel}</RangeButtonText>
        </RangeButton>
        <RangeButton testID={E2E_TEST_IDS.trends.dateRangeToButton} onPress={openEndPicker}>
          <RangeButtonText>To: {endLabel}</RangeButtonText>
        </RangeButton>
      </CustomRow>

      <HelpText>Or pick exact dates</HelpText>
    </Container>
  );
};

const Container = styled.View`
  margin-vertical: 10px;
`;

const PillRow = styled.View`
  flex-direction: row;
  justify-content: center;
  margin-bottom: 8px;
`;

const Pill = styled.View`
  flex-direction: row;
  align-items: center;
  padding: 2px;
  border-radius: 999px;
  background-color: ${({theme}) => addOpacity(theme.black, 0.06)};
`;

const PillSegment = styled.TouchableOpacity<{selected?: boolean}>`
  padding: 8px 12px;
  border-radius: 999px;
  background-color: ${({selected, theme}) =>
    selected ? theme.buttonBackgroundColor : 'transparent'};
`;

const PillSegmentText = styled.Text<{selected?: boolean}>`
  font-weight: 700;
  color: ${({selected, theme}) =>
    selected ? theme.buttonTextColor : addOpacity(theme.textColor, 0.8)};
`;

const CustomRow = styled.View`
  flex-direction: row;
  justify-content: center;
`;

const HelpText = styled.Text`
  text-align: center;
  margin-top: 6px;
  font-size: 14px;
  color: ${({theme}) => addOpacity(theme.textColor, 0.9)};
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
