import React from 'react';
import styled, {useTheme} from 'styled-components/native';
import LinearGradient from 'react-native-linear-gradient';
import DirectionArrows from '../../components/DirectionArrows';
import {BgSample} from '../../types/day_bgs';
import {Theme} from 'app/types/theme';

const BgDataCard = ({
  bgData,
  prevBgData,
}: {
  bgData: BgSample;
  prevBgData: BgSample;
}) => {
  const theme = useTheme() as Theme;
  return (
    <DataRowContainer>
      <LinearGradient
        colors={[
          prevBgData
            ? theme.determineBgColorByGlucoseValue(prevBgData.sgv)
            : '#FFFFFF',
          theme.determineBgColorByGlucoseValue(bgData.sgv),
        ]}
        start={{x: 0, y: 0}}
        end={{x: 1, y: 0}}
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: 10,
          borderBottomWidth: 1,
          borderBottomColor: theme.borderColor,
          width: '100%',
          borderRadius: 5, // Added border radius for better visual effect
          marginTop: 2, // Added margin top for a stacked card effect
        }}>
        <DataRowText>{bgData.sgv}</DataRowText>
        <DirectionArrows trendDirection={bgData.direction} />
        <DataRowText> {prevBgData && bgData.sgv - prevBgData.sgv} </DataRowText>
        <DataRowText>{new Date(bgData.date).toLocaleString()}</DataRowText>
      </LinearGradient>
    </DataRowContainer>
  );
};

const DataRowContainer = styled.View`
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
`;

const DataRowText = styled.Text`
  font-size: 16px;
`;

export default React.memo(BgDataCard, (prevProps, nextProps) => {
  return prevProps.bgData.date === nextProps.bgData.date;
});
