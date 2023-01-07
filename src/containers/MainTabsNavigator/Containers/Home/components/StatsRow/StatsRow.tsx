import React from 'react';
import styled from 'styled-components/native';
import {View, Text} from 'react-native';
import {BgSample} from 'app/types/day_bgs';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';

const Container = styled.View`
  padding: 10px;
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  flex-wrap: wrap;
`;

const Column = styled.View`
  flex-direction: column;
  align-items: center;
`;

const ValueText = styled.Text`
  font-size: 18px;
  font-weight: bold;
  color: #333;
`;

const LabelText = styled.Text`
  font-size: 14px;
  color: #666;
`;

interface StatsRowProps {
  bgData: BgSample[];
}

function findBiggestChangesInTimeRange(
  bgSamples: BgSample[],
  timeRange: number,
): {
  upChange: {
    fromValue: number;
    toValue: number;
    fromTime: string;
    toTime: string;
  };
  downChange: {
    fromValue: number;
    toValue: number;
    fromTime: string;
    toTime: string;
  };
} {
  // Sort the bgSamples array by date in ascending order
  const sortedBgSamples = Array.from(bgSamples).sort((a, b) => a.date - b.date);

  // Initialize maxChanges to { upChange: {...}, downChange: {...} }
  let maxChanges = {
    upChange: {fromValue: 0, toValue: 0, fromTime: '', toTime: ''},
    downChange: {fromValue: 0, toValue: 0, fromTime: '', toTime: ''},
  };

  for (let i = 1; i < sortedBgSamples.length; i++) {
    const bgSample = sortedBgSamples[i];
    const prevBgSample = sortedBgSamples[i - 1];

    // Calculate the difference between the current bgSample's sgv value and the previous bgSample's sgv value
    const change = bgSample.sgv - prevBgSample.sgv;

    // Calculate the time difference between the current bgSample and the previous bgSample in minutes
    const timeDifference = (bgSample.date - prevBgSample.date) / (1000 * 60);

    // If the time difference is less than or equal to the timeRange and the change is greater than the current maxChange, update maxChange
    if (timeDifference <= timeRange) {
      if (
        change >
        maxChanges.upChange.toValue - maxChanges.upChange.fromValue
      ) {
        maxChanges.upChange = {
          fromValue: prevBgSample.sgv,
          toValue: bgSample.sgv,
          fromTime: prevBgSample.dateString,
          toTime: bgSample.dateString,
        };
      }

      if (
        change <
        maxChanges.downChange.toValue - maxChanges.downChange.fromValue
      ) {
        maxChanges.downChange = {
          fromValue: prevBgSample.sgv,
          toValue: bgSample.sgv,
          fromTime: prevBgSample.dateString,
          toTime: bgSample.dateString,
        };
      }
    }
  }

  return maxChanges;
}

export const StatsRow: React.FC<StatsRowProps> = ({bgData}) => {
  // Calculate the statistics from the bgData array
  const averageBg = Math.floor(
    bgData.reduce((acc, bg) => acc + bg.sgv, 0) / bgData.length,
  );
  const lowestBg = Math.min(...bgData.map(bg => bg.sgv));
  const highestBg = Math.max(...bgData.map(bg => bg.sgv));
  const bgChangeTimeRange = 30;
  const {upChange, downChange} = findBiggestChangesInTimeRange(
    bgData,
    bgChangeTimeRange,
  );

  return (
    <>
      <Container>
        <Column style={{flex: 1}}>
          <LabelText>Average BG</LabelText>
          <ValueText>{averageBg}</ValueText>
        </Column>
        <Column style={{flex: 1}}>
          <LabelText>Lowest BG</LabelText>
          <ValueText>{lowestBg}</ValueText>
        </Column>
        <Column style={{flex: 1}}>
          <LabelText>Highest BG</LabelText>
          <ValueText>{highestBg}</ValueText>
        </Column>
      </Container>
      <Container>
        <Column style={{flex: 1}}>
          <LabelText>Biggest rise up</LabelText>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <ValueText>{upChange.fromValue}</ValueText>
            <Text style={{fontSize: 24}}>{'\u2191'}</Text>
            <ValueText>{upChange.toValue}</ValueText>
          </View>
          <Text style={{fontSize: 14, color: '#666'}}>
            {formatDateToLocaleTimeString(upChange.fromTime)} -{' '}
            {formatDateToLocaleTimeString(upChange.toTime)}
          </Text>
        </Column>
        <Column style={{flex: 1}}>
          <LabelText>Biggest fall down</LabelText>
          <View style={{flexDirection: 'row', alignItems: 'center'}}>
            <ValueText>{downChange.fromValue}</ValueText>
            <Text style={{fontSize: 24}}>{'\u2193'}</Text>
            <ValueText>{downChange.toValue}</ValueText>
          </View>
          <Text style={{fontSize: 14, color: '#666'}}>
            {formatDateToLocaleTimeString(downChange.fromTime)} -{' '}
            {formatDateToLocaleTimeString(downChange.toTime)}
          </Text>
        </Column>
      </Container>
    </>
  );
};

export default StatsRow;
