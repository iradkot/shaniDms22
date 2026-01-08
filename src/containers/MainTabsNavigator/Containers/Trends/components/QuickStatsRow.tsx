import React from 'react';
import {View} from 'react-native';
import styled from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {DEFAULT_NIGHT_WINDOW, formatHourWindowLabel} from 'app/constants/GLUCOSE_WINDOWS';

type Props = {
  avgTddUPerDay: number | null;
  basalPct: number | null;
  bolusPct: number | null;
  hyposPerWeek: number;
  nightTirPct: number | null;
  avgCarbsGPerDay: number | null;

  avgTddTestID?: string;
};

const Section = styled.View.attrs({collapsable: false})`
  padding-top: 6px;
  padding-right: 10px;
  padding-bottom: 6px;
  padding-left: 10px;
`;

const CardRow = styled.View.attrs({collapsable: false})`
  flex-direction: row;
  justify-content: flex-start;
  margin-bottom: 8px;
`;

const CardSurface = styled.View.attrs({collapsable: false})`
  background-color: ${({theme}: {theme: ThemeType}) => theme.white};
  border-radius: 12px;
  padding: 12px;
  width: 100%;
`;

const CardTitle = styled.Text`
  font-size: 12px;
  font-weight: 700;
  color: ${({theme}: {theme: ThemeType}) => addOpacity(theme.textColor, 0.75)};
`;

const CardValue = styled.Text<{color?: string}>`
  margin-top: 6px;
  font-size: 18px;
  font-weight: 800;
  color: ${({theme, color}: {theme: ThemeType; color?: string}) => color ?? theme.textColor};
`;

const CardSubtle = styled.Text`
  margin-top: 4px;
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
}) => {
  const basalBolusText =
    typeof basalPct === 'number' && typeof bolusPct === 'number'
      ? `${Math.round(basalPct)}% / ${Math.round(bolusPct)}%`
      : '—';

  return (
    <Section>
      <CardRow>
        <View collapsable={false} style={{flex: 1, marginRight: 8}}>
          <CardSurface testID={avgTddTestID} collapsable={false}>
            <CardTitle>Avg TDD</CardTitle>
            <CardValue>{fmtMaybe(avgTddUPerDay ? Number(avgTddUPerDay.toFixed(1)) : avgTddUPerDay, ' U/day')}</CardValue>
            <CardSubtle>Basal + bolus</CardSubtle>
          </CardSurface>
        </View>

        <View collapsable={false} style={{flex: 1, marginRight: 8}}>
          <CardSurface>
            <CardTitle>Basal / Bolus</CardTitle>
            <CardValue>{basalBolusText}</CardValue>
            <CardSubtle>Percent of total</CardSubtle>
          </CardSurface>
        </View>

        <View collapsable={false} style={{flex: 1}}>
          <CardSurface>
            <CardTitle>Hypos</CardTitle>
            <CardValue>{`${hyposPerWeek.toFixed(1)}/wk`}</CardValue>
            <CardSubtle>Events &lt; {cgmRange.TARGET.min} mg/dL</CardSubtle>
          </CardSurface>
        </View>
      </CardRow>

      <CardRow>
        <View collapsable={false} style={{flex: 1, marginRight: 8}}>
          <CardSurface>
            <CardTitle>Night TIR</CardTitle>
            <CardValue>{fmtMaybe(nightTirPct !== null ? Math.round(nightTirPct) : null, '%')}</CardValue>
            <CardSubtle>{formatHourWindowLabel(DEFAULT_NIGHT_WINDOW)}</CardSubtle>
          </CardSurface>
        </View>

        <View collapsable={false} style={{flex: 1}}>
          <CardSurface>
            <CardTitle>Avg Carbs</CardTitle>
            <CardValue>{fmtMaybe(avgCarbsGPerDay !== null ? Math.round(avgCarbsGPerDay) : null, ' g/day')}</CardValue>
            <CardSubtle>Treatments carbs</CardSubtle>
          </CardSurface>
        </View>
      </CardRow>
    </Section>
  );
};

export default QuickStatsRow;
