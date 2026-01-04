import React, {useMemo} from 'react';
import styled, {useTheme} from 'styled-components/native';
import DirectionArrows from 'app/components/DirectionArrows';
import {BgSample} from 'app/types/day_bgs.types';
import {ThemeType} from 'app/types/theme';
import DropShadow from 'react-native-drop-shadow';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import BgGradient from 'app/components/BgGradient';
import {FlexAlignType} from 'react-native';
import LoadBars from 'app/components/LoadBars/LoadBars';
import {LOAD_BARS_CONSTANTS} from 'app/utils/loadBars.utils';

const BG_DATA_CARD_CONSTANTS = {
  borderBottomWidth: 1,
  rowBorderRadius: 1,
  rowMarginTop: 0.1,
  timeMarginTop: 2,
  shadowOffsetWidth: 1,
  shadowOffsetHeight: 1,
  shadowOpacity: 0.5,
  shadowRadius: 2,
} as const;

interface BgDataCardProps {
  bgData: BgSample;
  prevBgData?: BgSample;
  maxIobReference: number;
  maxCobReference: number;

  /**
   * Presentation variant.
   * - `list`: compact row used in the CGM log list (default)
   * - `featured`: used for the latest/primary row (e.g. Home)
   */
  variant?: 'list' | 'featured';
}

const BgDataCard = ({
  bgData,
  prevBgData,
  maxIobReference,
  maxCobReference,
  variant = 'list',
}: BgDataCardProps) => {
  const theme = useTheme() as ThemeType;

  const bgStartColor = useMemo(() => {
    return prevBgData
      ? theme.determineBgColorByGlucoseValue(prevBgData.sgv)
      : theme.white;
  }, [prevBgData, theme]);

  const bgEndColor = useMemo(() => {
    return theme.determineBgColorByGlucoseValue(bgData.sgv);
  }, [bgData.sgv, theme]);

  const formattedDate = useMemo(() => {
    return formatDateToLocaleTimeString(new Date(bgData.date));
  }, [bgData.date]);

  const delta = useMemo(() => {
    if (!prevBgData) return '';
    const diff = bgData.sgv - prevBgData.sgv;
    return diff === 0 ? '0' : diff > 0 ? `+${diff}` : `${diff}`;
  }, [bgData.sgv, prevBgData]);

  const linearGradientStyle = useMemo(() => {
    const isFeatured = variant === 'featured';

    return {
      flexDirection: 'row' as const,
      justifyContent: 'flex-start' as const,
      alignItems: 'center' as FlexAlignType,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      borderBottomWidth: isFeatured ? 0 : BG_DATA_CARD_CONSTANTS.borderBottomWidth,
      borderBottomColor: theme.borderColor,
      width: '100%',
      borderRadius: isFeatured ? theme.borderRadius : BG_DATA_CARD_CONSTANTS.rowBorderRadius,
      marginTop: isFeatured ? theme.spacing.sm : BG_DATA_CARD_CONSTANTS.rowMarginTop,
      marginHorizontal: isFeatured ? theme.spacing.md : 0,
      height: LOAD_BARS_CONSTANTS.rowHeight,
    };
  }, [theme, variant]);

  const dropShadowStyle = useMemo(() => {
    return {
      shadowColor: theme.shadowColor,
      shadowOffset: {
        width: BG_DATA_CARD_CONSTANTS.shadowOffsetWidth,
        height: BG_DATA_CARD_CONSTANTS.shadowOffsetHeight,
      },
      shadowOpacity: BG_DATA_CARD_CONSTANTS.shadowOpacity,
      shadowRadius: BG_DATA_CARD_CONSTANTS.shadowRadius,
    };
  }, [theme.shadowColor]);

  return (
    <DataRowContainer>
      <BgGradient
        startColor={bgStartColor}
        endColor={bgEndColor}
        style={linearGradientStyle}>
        <TimeBgSection>
          <BgAndTrendRow>
            <DropShadow style={dropShadowStyle}>
              <BgValueText>{bgData.sgv}</BgValueText>
            </DropShadow>
            <DirectionArrows trendDirection={bgData.direction} />
          </BgAndTrendRow>
          <TimeText numberOfLines={1}>{formattedDate}</TimeText>
        </TimeBgSection>

        <DeltaSection>
          <DeltaText numberOfLines={1}>{delta}</DeltaText>
        </DeltaSection>

        <BarsSection>
          <LoadBars
            iobTotal={bgData.iob}
            iobBolus={bgData.iobBolus}
            iobBasal={bgData.iobBasal}
            cob={bgData.cob}
            maxIobReference={maxIobReference}
            maxCobReference={maxCobReference}
          />
        </BarsSection>
      </BgGradient>
    </DataRowContainer>
  );
};

const DataRowContainer = styled.View`
  flex-direction: row;
  justify-content: flex-start;
  align-items: center;
  width: 100%;
`;

const DataRowText = styled.Text<{theme: ThemeType}>`
  font-size: 16px;
  color: ${props => props.theme.textColor};
`;

const TimeBgSection = styled.View`
  width: ${LOAD_BARS_CONSTANTS.timeBgSectionWidth}px;
  flex-shrink: 0;
  flex-direction: column;
  justify-content: center;
`;

const BgAndTrendRow = styled.View`
  flex-direction: row;
  align-items: center;
`;

const BgValueText = styled(DataRowText)`
  font-weight: 800;
`;

const TimeText = styled.Text`
  margin-top: ${BG_DATA_CARD_CONSTANTS.timeMarginTop}px;
  font-size: ${({theme}) => theme.typography.size.xs}px;
  color: ${({theme}) => theme.textColor};
`;

const DeltaSection = styled.View`
  width: ${LOAD_BARS_CONSTANTS.deltaSectionWidth}px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
`;

const DeltaText = styled.Text`
  font-size: ${({theme}) => theme.typography.size.sm}px;
  font-weight: 700;
  color: ${({theme}) => theme.textColor};
`;

const BarsSection = styled.View`
  flex: 1;
  flex-shrink: 1;
  padding-left: ${({theme}) => theme.spacing.md}px;
`;

export default React.memo(
  BgDataCard,
  (prevProps, nextProps) =>
    prevProps?.bgData?.sgv === nextProps?.bgData?.sgv &&
    prevProps?.prevBgData?.sgv === nextProps?.prevBgData?.sgv &&
    prevProps?.bgData?.iob === nextProps?.bgData?.iob &&
    prevProps?.bgData?.cob === nextProps?.bgData?.cob &&
    prevProps?.bgData?.iobBolus === nextProps?.bgData?.iobBolus &&
    prevProps?.bgData?.iobBasal === nextProps?.bgData?.iobBasal &&
    prevProps?.maxIobReference === nextProps?.maxIobReference &&
    prevProps?.maxCobReference === nextProps?.maxCobReference,
);
