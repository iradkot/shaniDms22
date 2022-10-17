import {BgSample} from '../../../../../types/day_bgs';
import React from 'react';
import styled from 'styled-components';
import DirectionArrows from './DirectionArrows';

export const BgDataCard = ({bgData}: {bgData: BgSample}) => {
  return (
    <DataRowContainer bgValue={bgData.sgv}>
      <DataRowText>{bgData.sgv}</DataRowText>
      {/*<DataRowText>{bgData.direction}</DataRowText>*/}
      <DirectionArrows direction={bgData.direction} />
      <DataRowText>{new Date(bgData.date).toLocaleString()}</DataRowText>
    </DataRowContainer>
  );
};

const DataRowContainer = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom-width: 1px;
  border-bottom-color: #ccc;
  background-color: ${(props: {bgValue: number}) => {
    if (props.bgValue > 300) {
      // it goes from green to red the lower bg value is
      const scale = 1 - (props.bgValue - 300) / 300;
      return `rgba(255, 0, 0, ${scale})`;
      // return `rgb(255, ${Math.round(255 - (props.bgValue - 300) / 2)}, 1)`;
    } else if (props.bgValue > 180) {
      // it goes from green to yellow the higher bg value is
      const scale = 1 - (props.bgValue - 200) / 120;
      return `rgba(255, ${Math.round(255 * scale)}, 0, 1)`;
    } else if (props.bgValue > 70) {
      const scale = 1 - (props.bgValue - 70) / 130;
      return `rgba(0, 255, 0, ${scale})`;
      // the green is brighter the more it get close to the middle
      return `rgb(0, ${Math.round(255 - (props.bgValue - 70) / 2)}, 1)`;
    } else {
      const scale = 1 - (props.bgValue - 40) / 30;
      return `rgba(0, 255, 0, ${scale})`;
    }
    // give different background color based on bg value
    // for ranges 0 - 70 - red the more bg value is the more red it is
    // for ranges 70 - 180 - green
    // for ranges 180 - 300 - yellow
    // for ranges 300 - 500 - red
  }};
`;

const DataRowText = styled.Text`
  font-size: 16px;
`;
