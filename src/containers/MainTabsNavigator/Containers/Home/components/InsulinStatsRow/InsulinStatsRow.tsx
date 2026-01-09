// InsulinStatsRow.tsx
import React from 'react';
import styled from 'styled-components/native';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {addOpacity} from 'app/style/styling.utils';
import { GradientColumnComponent } from './GradientColumnComponent';
import { computeInsulinStats } from './InsulinDataCalculations';
import { InsulinDataEntry, BasalProfile } from 'app/types/insulin.types';

const Container = styled.View`
    background-color: ${props => props.theme.backgroundColor};
  padding: ${(props: {theme: ThemeType}) => props.theme.spacing.sm + 2}px;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: space-around;
`;

interface InsulinStatsRowProps {
  insulinData: InsulinDataEntry[];
  basalProfileData: BasalProfile;
  startDate: Date;
  endDate: Date;
}

export const InsulinStatsRow: React.FC<InsulinStatsRowProps> = ({
                                                                  insulinData,
                                                                  basalProfileData,
                                                                  startDate,
                                                                  endDate,
                                                                }) => {
  const theme = useTheme() as ThemeType;

  const stats = computeInsulinStats(insulinData, basalProfileData, startDate, endDate);

  const basalRatioPercentage = stats.totalInsulin > 0
    ? (stats.totalBasal / stats.totalInsulin) * 100
    : 0;

  return (
    <Container>
      <GradientColumnComponent
        label="Total Basal"
        value={`${stats.totalBasal.toFixed(2)} U`}
        iconName="water-percent"
        gradientColors={[addOpacity(theme.colors.insulinSecondary, 0.9), theme.colors.insulin]}
      />
      <GradientColumnComponent
        label="Total Bolus"
        value={`${stats.totalBolus.toFixed(2)} U`}
        iconName="needle"
        gradientColors={[addOpacity(theme.belowRangeColor, 0.9), theme.belowRangeColor]}
      />
      <GradientColumnComponent
        label="Basal/Bolus Ratio"
        value={`${basalRatioPercentage.toFixed(0)}%`}
        progress={basalRatioPercentage}
        gradientColors={[addOpacity(theme.inRangeColor, 0.9), theme.inRangeColor]}
      />
      <GradientColumnComponent
        label="Total Insulin"
        value={`${stats.totalInsulin.toFixed(1)} U`}
        iconName="calculator"
        gradientColors={[addOpacity(theme.aboveRangeColor, 0.9), theme.aboveRangeColor]}
      />
    </Container>
  );
};

export default InsulinStatsRow;
