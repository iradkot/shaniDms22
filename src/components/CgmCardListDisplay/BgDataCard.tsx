import React, {useMemo} from 'react';
import styled, {useTheme} from 'styled-components/native';
import DirectionArrows from 'app/components/DirectionArrows';
import {BgSample} from 'app/types/day_bgs.types';
import {ThemeType} from 'app/types/theme';
import { BoxShadow as DropShadow } from 'expo-react-native-shadow';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import BgGradient from 'app/components/BgGradient';
import {FlexAlignType} from 'react-native';

interface BgDataCardProps {
  bgData: BgSample;
  prevBgData: BgSample;
}

const BgDataCard = ({bgData, prevBgData}: BgDataCardProps) => {
  const theme = useTheme() as ThemeType;

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
      flexDirection: 'row' as const,
      justifyContent: 'space-around' as const,
      alignItems: 'center' as FlexAlignType,
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.borderColor,
      width: '100%',
      borderRadius: 1,
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
      <BgGradient
        startColor={bgStartColor}
        endColor={bgEndColor}
        style={linearGradientStyle}>
        <DropShadow style={dropShadowStyle}>
          <DataRowText>{bgData.sgv}</DataRowText>
        </DropShadow>
        <DirectionArrows trendDirection={bgData.direction} />
        <DataRowText>{prevBgData && bgData.sgv - prevBgData.sgv}</DataRowText>
        <DataRowText>{formattedDate}</DataRowText>
      </BgGradient>
    </DataRowContainer>
  );
};

const DataRowContainer = styled.View`
  flex-direction: row;
  justify-content: space-around;
  align-items: center;
`;

const DataRowText = styled.Text<{theme: ThemeType}>`
  font-size: 16px;
  color: ${props => props.theme.textColor};
`;

export default React.memo(
  BgDataCard,
  (prevProps, nextProps) =>
    prevProps?.bgData?.sgv === nextProps?.bgData?.sgv &&
    prevProps?.prevBgData?.sgv === nextProps?.prevBgData?.sgv,
);
