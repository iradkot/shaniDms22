import React from 'react';
import styled, {useTheme} from 'styled-components/native';
import LinearGradient from 'react-native-linear-gradient';
import DirectionArrows from 'app/components/DirectionArrows';
import {BgSample} from 'app/types/day_bgs';
import {Theme} from 'app/types/theme';
import DropShadow from 'react-native-drop-shadow';

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
        // colors={['#FFFFFF', '#FFFFFF']}
        start={{x: 0, y: 1}}
        end={{x: 0, y: 0}}
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
        <DropShadow
          style={{
            shadowColor: '#fff',
            shadowOffset: {
              width: 1,
              height: 1,
            },
            shadowOpacity: 0.5,
            shadowRadius: 2,
          }}>
          <DataRowText>{bgData.sgv}</DataRowText>
        </DropShadow>
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

const DataRowText = styled.Text<{theme: Theme}>`
  font-size: 16px;
  color: ${props => props.theme.textColor};
`;

export default React.memo(BgDataCard, (prevProps, nextProps) => {
  return prevProps.bgData.date === nextProps.bgData.date;
});
