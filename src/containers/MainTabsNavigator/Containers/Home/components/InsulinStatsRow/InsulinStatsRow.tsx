// InsulinStatsRow.tsx
import React from 'react';
import styled from 'styled-components/native';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import {GradientColumnComponent} from './GradientColumnComponent';
import {computeInsulinStats} from './InsulinDataCalculations';
import type {DailyInsulinSourceSummary} from 'app/modules/dailyOverview';
import {DAILY_OVERVIEW_COPY} from 'app/product/dailyOverview/copy';
import {formatDailyValue} from 'app/product/dailyOverview/dailyOverviewPresentation';

const Container = styled.View`
  background-color: ${props => props.theme.backgroundColor};
  padding: ${(props: {theme: ThemeType}) => props.theme.spacing.sm + 2}px;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: space-around;
`;

interface InsulinStatsRowProps {
  summary: DailyInsulinSourceSummary;
  locale?: 'en' | 'he';
}

export const InsulinStatsRow: React.FC<InsulinStatsRowProps> = ({
  summary,
  locale = 'en',
}) => {
  const theme = useTheme() as ThemeType;

  const insulin = computeInsulinStats(summary);
  const copy = DAILY_OVERVIEW_COPY[locale];
  const units = (value: number | undefined) =>
    value === undefined ? '—' : `${formatDailyValue(value)} U`;
  const estimated =
    insulin.total === undefined && insulin.estimatedTotal !== undefined;
  const primary =
    insulin.total ??
    insulin.estimatedTotal ??
    insulin.subtotal ??
    insulin.bolus ??
    insulin.basal;
  const primaryLabel =
    insulin.total !== undefined
      ? copy.recordedTotal
      : estimated
      ? copy.estimatedTotal
      : insulin.subtotal !== undefined
      ? copy.recordedSubtotal
      : insulin.bolus !== undefined
      ? copy.recordedBolus
      : insulin.basal !== undefined
      ? insulin.basalComplete
        ? copy.recordedBasal
        : copy.recordedSubtotal
      : copy.insulinUnavailable;
  const coverage =
    !insulin.basalComplete && insulin.basalCoveragePercent !== undefined
      ? `${formatDailyValue(insulin.basalCoveragePercent)}% ${
          copy.basalCoverage
        }`
      : undefined;

  return (
    <Container>
      <GradientColumnComponent
        label={estimated ? copy.estimatedBasal : copy.basal}
        value={units(estimated ? insulin.estimatedBasal : insulin.basal)}
        time={
          estimated
            ? `${copy.recordedBasal}: ${units(insulin.basal)}${
                coverage ? ` · ${coverage}` : ''
              }`
            : coverage ??
              (insulin.basal === undefined ? copy.basalUnknown : undefined)
        }
        iconName="water-percent"
        gradientColors={[
          addOpacity(theme.colors.insulinSecondary, 0.9),
          theme.colors.insulin,
        ]}
      />
      <GradientColumnComponent
        label={copy.recordedBolus}
        value={units(insulin.bolus)}
        iconName="needle"
        gradientColors={[
          addOpacity(theme.belowRangeColor, 0.9),
          theme.belowRangeColor,
        ]}
      />
      <GradientColumnComponent
        label={locale === 'he' ? 'בזאל / בולוס' : 'Basal / bolus'}
        value={
          insulin.basalPercent === undefined
            ? '—'
            : `${insulin.basalPercent}% / ${insulin.bolusPercent}%`
        }
        progress={insulin.basalPercent}
        gradientColors={[
          addOpacity(theme.inRangeColor, 0.9),
          theme.inRangeColor,
        ]}
      />
      <GradientColumnComponent
        label={primaryLabel}
        value={units(primary)}
        time={
          estimated
            ? copy.estimateNote
            : insulin.total === undefined && primary !== undefined
            ? copy.totalIncomplete
            : undefined
        }
        iconName="calculator"
        gradientColors={[
          addOpacity(theme.aboveRangeColor, 0.9),
          theme.aboveRangeColor,
        ]}
      />
    </Container>
  );
};

export default InsulinStatsRow;
