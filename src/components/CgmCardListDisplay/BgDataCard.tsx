import {BgSample} from '../../types/day_bgs';
import React from 'react';
import styled from 'styled-components/native';
import DirectionArrows from '../../components/DirectionArrows';
import {getBackgroundColor} from 'app/utils/styling.utils';

const BgDataCard = ({
  bgData,
  prevBgData,
}: {
  bgData: BgSample;
  prevBgData: BgSample;
}) => {
  return (
    <DataRowContainer bgValue={bgData.sgv}>
      <DataRowText>{bgData.sgv}</DataRowText>
      {/*<DataRowText>{bgData.trendDirection}</DataRowText>*/}
      <DirectionArrows trendDirection={bgData.direction} />
      <DataRowText> {prevBgData && bgData.sgv - prevBgData.sgv} </DataRowText>
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
  background-color: ${({bgValue}: {bgValue: number}) =>
    getBackgroundColor(bgValue)};
`;

const DataRowText = styled.Text`
  font-size: 16px;
`;

export default React.memo(BgDataCard, (prevProps, nextProps) => {
  return prevProps.bgData.date === nextProps.bgData.date;
});
