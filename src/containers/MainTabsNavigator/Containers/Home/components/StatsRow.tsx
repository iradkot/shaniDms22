import React from 'react';
import styled from 'styled-components/native';
import {View, Text} from 'react-native';
import {BgSample} from 'app/types/day_bgs';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {
  calculateAverageAndStdDev,
  findBiggestChangesInTimeRange,
} from 'app/utils/bg.utils';

// Add background colors to the Container component
const Container = styled.View`
  padding: 5px 10px;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  flex-wrap: wrap;
  background-color: #f5f5f5;
`;

// Add some padding to the Column component
const Column = styled.View`
  flex-direction: column;
  align-items: center;
  padding: 10px;
  height: 100%;
`;

// Increase the font size and weight of the ValueText component
const ValueText = styled.Text<{color?: string}>`
  font-size: 24px;
  font-weight: bold;
  color: ${props => (props.color ? props.color : '#333')};
`;

// Increase the font size of the LabelText component
const LabelText = styled.Text<{color?: string}>`
  font-size: 18px;
  color: ${props => (props.color ? props.color : '#333')};
`;

// noinspection CssNoGenericFontName
const TimeValueText = styled(ValueText)`
  font-size: 16px;
  font-family: Courier New;
`;

const StDevValueText = styled(ValueText)`
  font-size: 16px;
  color: ${props => (props.color ? props.color : '#333')};
`;

interface StatsRowProps {
  bgData: BgSample[];
}

export const StatsRow: React.FC<StatsRowProps> = ({bgData}) => {
  // Calculate the statistics from the bgData array
  const {averageBg, stdDev} = calculateAverageAndStdDev(bgData);
  const {lowestBg, highestBg} = bgData.reduce(
    (acc, bg) => {
      if (bg.sgv <= acc.lowestBg.sgv) {
        acc.lowestBg = bg;
      }
      if (bg.sgv >= acc.highestBg.sgv) {
        acc.highestBg = bg;
      }
      return acc;
    },
    {lowestBg: bgData[0], highestBg: bgData[0]},
  );
  const bgChangeTimeRange = 30;
  const {upChange, downChange} = findBiggestChangesInTimeRange(
    bgData,
    bgChangeTimeRange,
  );

  return (
    <>
      <Container>
        {/* Add a background color to the column with the lowest blood glucose value */}
        <Column style={{flex: 1, backgroundColor: '#90ee90'}}>
          <LabelText>Average BG</LabelText>
          <ValueText>{averageBg}</ValueText>
          <StDevValueText color={stdDev >= 0 ? '#00b300' : '#e33734'}>
            {stdDev >= 0 ? '+' : '-'}
            {stdDev.toFixed(2)}
          </StDevValueText>
        </Column>
        {/* Add a background color to the column with the lowest blood glucose value */}
        <Column style={{flex: 1, backgroundColor: '#e33734'}}>
          <LabelText color={'#ffffff'}>Lowest BG</LabelText>
          <ValueText color={'#ffffff'}>{lowestBg.sgv}</ValueText>
          <TimeValueText color={'#ffffff'}>
            {formatDateToLocaleTimeString(lowestBg.date)}
          </TimeValueText>
        </Column>
        {/* Add a background color to the column with the highest blood glucose value */}
        <Column style={{flex: 1, backgroundColor: '#faf87f'}}>
          <LabelText>Highest BG</LabelText>
          <ValueText>{highestBg.sgv}</ValueText>
          <TimeValueText>
            {formatDateToLocaleTimeString(highestBg.date)}
          </TimeValueText>
        </Column>
      </Container>
      <Container>
        <Column style={{flex: 1}}>
          <LabelText>Biggest rise up</LabelText>
          {/* Use icons to represent the blood glucose values */}
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <ValueText>{upChange.fromValue}</ValueText>
            <Text style={{fontSize: 24}}>{'\u2191'}</Text>
            <ValueText>{upChange.toValue}</ValueText>
          </View>
          <TimeValueText style={{fontSize: 14, color: '#666'}}>
            {formatDateToLocaleTimeString(upChange.fromTime)} -{' '}
            {formatDateToLocaleTimeString(upChange.toTime)}
          </TimeValueText>
        </Column>
        <Column style={{flex: 1}}>
          <LabelText>Biggest fall down</LabelText>
          {/* Use icons to represent the blood glucose values */}
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <ValueText>{downChange.fromValue}</ValueText>
            <Text style={{fontSize: 24}}>{'\u2193'}</Text>
            <ValueText>{downChange.toValue}</ValueText>
          </View>
          <TimeValueText style={{fontSize: 14, color: '#666'}}>
            {formatDateToLocaleTimeString(downChange.fromTime)} -{' '}
            {formatDateToLocaleTimeString(downChange.toTime)}
          </TimeValueText>
        </Column>
      </Container>
    </>
  );
};

export default StatsRow;
