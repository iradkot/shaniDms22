import React from 'react';
import styled from 'styled-components/native';
import {BgSample} from 'app/types/day_bgs';
import {Text} from 'react-native';
import {cgmRange} from 'app/constants/PLAN_CONFIG';

const Container = styled.View`
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
  border-radius: 10px;
  background-color: white;
  shadow-color: #000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.3;
  shadow-radius: 4;
  elevation: 2;
  border: 2px solid #333;
`;

const Column = styled.View<{color: string; width: number}>`
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: ${props => props.width}%;
  height: 50px;
  background-color: ${props => props.color};
  border-radius: 10px;
`;

const PercentageText = styled.Text<{color: string}>`
  font-size: 18px;
  font-weight: bold;
  color: ${props => props.color || 'white'};
`;

interface TimeInRangeRowProps {
  bgData: BgSample[];
}

export const TimeInRangeRow: React.FC<TimeInRangeRowProps> = ({bgData}) => {
  const timeInRange = bgData.filter(
    // @ts-ignore
    bg => bg.sgv >= cgmRange.TARGET.min && bg.sgv <= cgmRange.TARGET.max,
  );
  const timeInRangePercentage = Math.floor(
    (timeInRange.length / bgData.length) * 100,
  );
  const lowPercentage = Math.floor(
    // @ts-ignore
    (bgData.filter(bg => bg.sgv < cgmRange.TARGET.min).length / bgData.length) *
      100,
  );
  const highPercentage = Math.floor(
    // @ts-ignore
    (bgData.filter(bg => bg.sgv > cgmRange.TARGET.max).length / bgData.length) *
      100,
  );

  return (
    <Container>
      <Column width={lowPercentage} color={'red'}>
        <PercentageText>{lowPercentage}%</PercentageText>
      </Column>
      <Column width={timeInRangePercentage} color={'green'}>
        <PercentageText>{timeInRangePercentage}%</PercentageText>
      </Column>
      <Column width={highPercentage} color={'yellow'}>
        <PercentageText color={'black'}>{highPercentage}%</PercentageText>
      </Column>
    </Container>
  );
};

export default TimeInRangeRow;
