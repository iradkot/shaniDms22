import React, {useMemo} from 'react';
import styled, {useTheme} from 'styled-components/native';
import LinearGradient from 'react-native-linear-gradient';
import DirectionArrows from 'app/components/DirectionArrows';
import {BgSample} from 'app/types/day_bgs';
import {Theme} from 'app/types/theme';
import DropShadow from 'react-native-drop-shadow';
import {addOpacity} from 'app/utils/styling.utils';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';

interface BgDataCardProps {
  bgData: BgSample;
  prevBgData: BgSample;
}

const BgDataCard = ({bgData, prevBgData}: BgDataCardProps) => {
  const theme = useTheme() as Theme;

  const bgStartColor = useMemo(() => {
    return prevBgData
      ? theme.determineBgColorByGlucoseValue(prevBgData.sgv)
      : '#FFFFFF';
  }, [prevBgData, theme]);

  const bgEndColor = useMemo(() => {
    return theme.determineBgColorByGlucoseValue(bgData.sgv);
  }, [bgData.sgv, theme]);

  const formattedDate = useMemo(() => {
    return formatDateToLocaleTimeString(new Date(bgData.date));
  }, [bgData.date]);

  const linearGradientStyle = useMemo(() => {
    return {
      flexDirection: 'row',
      justifyContent: 'space-around',
      alignItems: 'center',
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderColor,
      width: '100%',
      borderRadius: 5,
      marginTop: 0.1,
    };
  }, [theme]);

  const dropShadowStyle = useMemo(() => {
    return {
      shadowColor: '#000',
      shadowOffset: {
        width: 1,
        height: 1,
      },
      shadowOpacity: 0.5,
      shadowRadius: 2,
    };
  }, []);

  return (
    <DataRowContainer>
      <LinearGradient
        colors={[
          addOpacity(bgStartColor, 0.2),
          addOpacity(bgStartColor, 0.5),
          addOpacity(bgStartColor, 0.9),
          bgStartColor,
          bgEndColor,
          addOpacity(bgEndColor, 0.9),
          addOpacity(bgEndColor, 0.5),
          addOpacity(bgEndColor, 0.2),
        ]}
        locations={[0, 0.02, 0.15, 0.25, 0.75, 0.85, 0.98, 1]}
        start={{x: 0, y: 1}}
        end={{x: 0, y: 0}}
        style={linearGradientStyle}>
        <DropShadow style={dropShadowStyle}>
          <DataRowText>{bgData.sgv}</DataRowText>
        </DropShadow>
        <DirectionArrows trendDirection={bgData.direction} />
        <DataRowText>{prevBgData && bgData.sgv - prevBgData.sgv}</DataRowText>
        <DataRowText>{formattedDate}</DataRowText>
      </LinearGradient>
    </DataRowContainer>
  );
};

const DataRowContainer = styled.View`
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
`;

const DataRowText = styled.Text<{theme: Theme}>`
  font-size: 16px;
  color: ${props => props.theme.textColor};
`;

export default React.memo(
  BgDataCard,
  (prevProps, nextProps) =>
    prevProps.bgData.sgv === nextProps.bgData.sgv &&
    prevProps.prevBgData.sgv === nextProps.prevBgData.sgv,
);
