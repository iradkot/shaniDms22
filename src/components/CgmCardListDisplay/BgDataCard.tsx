import {BgSample} from '../../types/day_bgs';
import React from 'react';
import styled from 'styled-components/native';
import DirectionArrows from '../../components/DirectionArrows';
import {Theme} from 'app/types/theme';

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

const DataRowContainer = styled.View<{bgValue: number; theme: Theme}>`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-bottom-width: 1px;
  border-bottom-color: ${({theme}) => theme.borderColor};
  background-color: ${({bgValue, theme}) =>
    theme.determineBgColorByGlucoseValue(bgValue)};
`;

const DataRowText = styled.Text`
  font-size: 16px;
`;

export default React.memo(BgDataCard, (prevProps, nextProps) => {
  return prevProps.bgData.date === nextProps.bgData.date;
});
