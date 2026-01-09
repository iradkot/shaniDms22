import React from 'react';
import {Pressable, View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {DEFAULT_NIGHT_WINDOW, formatHourWindowLabel} from 'app/constants/GLUCOSE_WINDOWS';

type Props = {
  avgTddUPerDay: number | null;
  basalPct: number | null;
  bolusPct: number | null;
  hyposPerWeek: number;
  nightTirPct: number | null;
  avgCarbsGPerDay: number | null;

  avgTddTestID?: string;

  onPressSevereHypos?: () => void;
};

const Section = styled.View.attrs({collapsable: false})`
  padding-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs + 2}px;
  padding-right: ${({theme}: {theme: ThemeType}) => theme.spacing.sm + 2}px;
  padding-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.xs + 2}px;
  padding-left: ${({theme}: {theme: ThemeType}) => theme.spacing.sm + 2}px;
`;

const CardRow = styled.View.attrs({collapsable: false})`
  flex-direction: row;
  justify-content: flex-start;
  margin-bottom: ${({theme}: {theme: ThemeType}) => theme.spacing.sm}px;
`;

const CardWrap = styled.View.attrs({collapsable: false})<{$withGap?: boolean}>`
  flex: 1;
  margin-right: ${({$withGap, theme}: {$withGap?: boolean; theme: ThemeType}) =>
    $withGap ? theme.spacing.sm : 0}px;
`;

const CardSurface = styled.View.attrs({collapsable: false})`
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-radius: 12px;
  padding: 12px;
  width: 100%;
`;

const PressableCardSurface = styled(Pressable).attrs({collapsable: false})`
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-radius: 12px;
  padding: 12px;
  width: 100%;
`;

const TitleRow = styled.View.attrs({collapsable: false})`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const CardTitle = styled.Text`
  font-size: 12px;
  font-weight: 700;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.75)};
`;

const CardValue = styled.Text<{color?: string}>`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs + 2}px;
  font-size: 18px;
  font-weight: 800;
  color: ${({theme, color}: {theme: ThemeType; color?: string}) => color ?? theme.textColor};
`;

const CardSubtle = styled.Text`
  margin-top: ${({theme}: {theme: ThemeType}) => theme.spacing.xs}px;
  font-size: 12px;
  font-weight: 600;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.65)};
`;

function fmtMaybe(value: number | null, suffix = ''): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return `${value}${suffix}`;
}

export const QuickStatsRow: React.FC<Props> = ({
  avgTddUPerDay,
  basalPct,
  bolusPct,
  hyposPerWeek,
  nightTirPct,
  avgCarbsGPerDay,
  avgTddTestID,
  onPressSevereHypos,
}) => {
  const theme = useTheme() as ThemeType;

  const avgTddRounded =
    typeof avgTddUPerDay === 'number' && Number.isFinite(avgTddUPerDay)
      ? Number(avgTddUPerDay.toFixed(1))
      : null;

  const severeHypoThresholdRaw = cgmRange[CGM_STATUS_CODES.EXTREME_LOW];
  const severeHypoThreshold =
    typeof severeHypoThresholdRaw === 'number' && Number.isFinite(severeHypoThresholdRaw)
      ? severeHypoThresholdRaw
      : cgmRange.TARGET.min;

  const basalBolusText =
    typeof basalPct === 'number' && typeof bolusPct === 'number'
      ? `${Math.round(basalPct)}% / ${Math.round(bolusPct)}%`
      : '—';

  return (
    <Section>
      <CardRow>
        <CardWrap $withGap>
          <CardSurface testID={avgTddTestID} collapsable={false}>
            <CardTitle>Avg TDD</CardTitle>
            <CardValue>{fmtMaybe(avgTddRounded, ' U/day')}</CardValue>
            <CardSubtle>Basal + bolus</CardSubtle>
          </CardSurface>
        </CardWrap>

        <CardWrap $withGap>
          <CardSurface>
            <CardTitle>Basal / Bolus</CardTitle>
            <CardValue>{basalBolusText}</CardValue>
            <CardSubtle>Percent of total</CardSubtle>
          </CardSurface>
        </CardWrap>

        <CardWrap>
          {onPressSevereHypos ? (
            <PressableCardSurface
              accessibilityRole="button"
              accessibilityLabel="Severe Hypos"
              accessibilityHint="Opens hypo investigation"
              onPress={onPressSevereHypos}
            >
              <TitleRow>
                <CardTitle>Severe Hypos</CardTitle>
                <Icon
                  name="chevron-right"
                  size={18}
                  color={addOpacity(theme.textColor, 0.45)}
                />
              </TitleRow>
              <CardValue>{`${hyposPerWeek.toFixed(1)}/wk`}</CardValue>
              <CardSubtle>Events &lt; {severeHypoThreshold} mg/dL</CardSubtle>
            </PressableCardSurface>
          ) : (
            <CardSurface>
              <CardTitle>Severe Hypos</CardTitle>
              <CardValue>{`${hyposPerWeek.toFixed(1)}/wk`}</CardValue>
              <CardSubtle>Events &lt; {severeHypoThreshold} mg/dL</CardSubtle>
            </CardSurface>
          )}
        </CardWrap>
      </CardRow>

      <CardRow>
        <CardWrap $withGap>
          <CardSurface>
            <CardTitle>Night TIR</CardTitle>
            <CardValue>{fmtMaybe(nightTirPct !== null ? Math.round(nightTirPct) : null, '%')}</CardValue>
            <CardSubtle>{formatHourWindowLabel(DEFAULT_NIGHT_WINDOW)}</CardSubtle>
          </CardSurface>
        </CardWrap>

        <CardWrap>
          <CardSurface>
            <CardTitle>Avg Carbs</CardTitle>
            <CardValue>{fmtMaybe(avgCarbsGPerDay !== null ? Math.round(avgCarbsGPerDay) : null, ' g/day')}</CardValue>
            <CardSubtle>Treatments carbs</CardSubtle>
          </CardSurface>
        </CardWrap>
      </CardRow>
    </Section>
  );
};

export default QuickStatsRow;
