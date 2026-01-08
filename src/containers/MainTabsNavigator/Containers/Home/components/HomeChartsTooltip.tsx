import React, {useMemo} from 'react';
import styled, {useTheme} from 'styled-components/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import {BgSample} from 'app/types/day_bgs.types';
import {ThemeType} from 'app/types/theme';
import {formatDateToLocaleTimeString} from 'app/utils/datetime.utils';
import {addOpacity, determineBgColorByGlucoseValue} from 'app/style/styling.utils';

type Props = {
  anchorTimeMs: number;
  bgSample: BgSample | null;
  activeInsulinU: number | null;
  cobG: number | null;
  basalRateUhr: number | null;
  bolusSummary: {count: number; totalU: number};
  carbsSummary: {count: number; totalG: number};

  /**
   * When true (default), the tooltip stretches to the available width.
   * When false, it sizes to its content (useful for landscape/fullscreen docking).
   */
  fullWidth?: boolean;

  /**
   * Optional max width constraint (px).
   */
  maxWidthPx?: number;
};

const HomeChartsTooltip: React.FC<Props> = ({
  anchorTimeMs,
  bgSample,
  activeInsulinU,
  cobG,
  basalRateUhr,
  bolusSummary,
  carbsSummary,
  fullWidth = true,
  maxWidthPx,
}) => {
  const theme = useTheme() as ThemeType;

  const timeText = useMemo(() => formatDateToLocaleTimeString(anchorTimeMs), [anchorTimeMs]);
  const bgText = useMemo(() => {
    if (!bgSample) return '—';
    return `${Math.round(bgSample.sgv)} mg/dL`;
  }, [bgSample]);
  const bgColor = useMemo(() => {
    if (!bgSample) return theme.textColor;
    return determineBgColorByGlucoseValue(bgSample.sgv, theme);
  }, [bgSample, theme]);

  const bgTrendIcon = useMemo(() => {
    const dir = bgSample?.direction;
    switch (dir) {
      case 'DoubleUp':
        return 'chevron-double-up';
      case 'SingleUp':
        return 'chevron-up';
      case 'FortyFiveUp':
        return 'arrow-top-right';
      case 'Flat':
        return 'arrow-right';
      case 'FortyFiveDown':
        return 'arrow-bottom-right';
      case 'SingleDown':
        return 'chevron-down';
      case 'DoubleDown':
        return 'chevron-double-down';
      case 'NOT COMPUTABLE':
      case 'RATE OUT OF RANGE':
        return 'help-circle-outline';
      default:
        return null;
    }
  }, [bgSample?.direction]);

  const activeText =
    activeInsulinU != null && Number.isFinite(activeInsulinU)
      ? `${activeInsulinU.toFixed(2)} U`
      : '—';
  const basalText =
    basalRateUhr != null && Number.isFinite(basalRateUhr)
      ? `${basalRateUhr.toFixed(2)} U/hr`
      : '—';
  const cobText = cobG != null && Number.isFinite(cobG) ? `${Math.round(cobG)} g` : '—';
  const bolusText =
    bolusSummary.count > 0
      ? `${bolusSummary.totalU.toFixed(2)} U (${bolusSummary.count})`
      : '—';
  const carbsText =
    carbsSummary.count > 0 ? `${Math.round(carbsSummary.totalG)} g (${carbsSummary.count})` : '—';

  return (
    <Container
      $fullWidth={fullWidth}
      pointerEvents="none"
      style={maxWidthPx != null ? {maxWidth: maxWidthPx} : undefined}
    >
      <Inner style={theme.shadow.small}>
        <HeaderRow>
          <HeaderLeft>
            <Icon name="clock-outline" size={18} color={addOpacity(theme.textColor, 0.8)} />
            <HeaderText>{timeText}</HeaderText>
          </HeaderLeft>

          <BgPill style={{borderColor: addOpacity(bgColor, 0.35)}}>
            <Icon name="water" size={18} color={bgColor} />
            <BgText style={{color: bgColor}} numberOfLines={1}>
              {bgText}
            </BgText>
            {bgTrendIcon ? (
              <BgTrendWrap>
                <Icon name={bgTrendIcon} size={18} color={bgColor} />
              </BgTrendWrap>
            ) : null}
          </BgPill>
        </HeaderRow>

        <Divider />

        <Grid>
          <Stat>
            <StatLabel>
              <Icon name="needle" size={16} color={theme.colors.insulin} /> Active insulin
            </StatLabel>
            <StatValue>{activeText}</StatValue>
          </Stat>

          <Stat>
            <StatLabel>
              <Icon
                name="chart-timeline-variant"
                size={16}
                color={addOpacity(theme.textColor, 0.75)}
              />
              {'  '}Basal
            </StatLabel>
            <StatValue>{basalText}</StatValue>
          </Stat>

          <Stat>
            <StatLabel>
              <Icon name="food-apple" size={16} color={theme.colors.carbs} /> COB
            </StatLabel>
            <StatValue>{cobText}</StatValue>
          </Stat>

          <Stat>
            <StatLabel>
              <Icon name="needle" size={16} color={theme.colors.insulinSecondary} /> Bolus
            </StatLabel>
            <StatValue>{bolusText}</StatValue>
          </Stat>

          <Stat $fullWidth>
            <StatLabel>
              <Icon name="bread-slice-outline" size={16} color={theme.colors.carbs} /> Carbs
            </StatLabel>
            <StatValue>{carbsText}</StatValue>
          </Stat>
        </Grid>
      </Inner>
    </Container>
  );
};

const Container = styled.View<{$fullWidth: boolean}>`
  ${({$fullWidth}: {$fullWidth: boolean}) => ($fullWidth ? 'width: 100%;' : '')}
`;

const Inner = styled.View`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-right: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-bottom: 0px;
  border-radius: ${({theme}: {theme: ThemeType}) => theme.borderRadius}px;
  border-width: 1px;
  border-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.12)};
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  padding: ${({theme}: {theme: ThemeType}) => theme.spacing.md}px
    ${({theme}: {theme: ThemeType}) => theme.spacing.lg}px;
`;

const HeaderRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const HeaderLeft = styled.View`
  flex-direction: row;
  align-items: center;
`;

const HeaderText = styled.Text`
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 800;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

const BgPill = styled.View`
  flex-direction: row;
  align-items: center;
  border-width: 1px;
  padding-vertical: 6px;
  padding-horizontal: 10px;
  border-radius: 999px;
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.white, 0.95)};
`;

const BgText = styled.Text`
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  font-weight: 900;
`;

const BgTrendWrap = styled.View`
  margin-left: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
`;

const Divider = styled.View`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  margin-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
  height: 1px;
  background-color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.08)};
`;

const Grid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-between;
`;

const Stat = styled.View<{$fullWidth?: boolean}>`
  width: ${({$fullWidth}: {$fullWidth?: boolean}) => ($fullWidth ? '100%' : '48%')};
  margin-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
`;

const StatLabel = styled.Text`
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.sm}px;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.7)};
`;

const StatValue = styled.Text`
  margin-top: 2px;
  font-size: ${({theme}: {theme: ThemeType}) => theme.typography.size.lg}px;
  font-weight: 900;
  color: ${({theme}: {theme: ThemeType}) => theme.textColor};
`;

export default HomeChartsTooltip;
