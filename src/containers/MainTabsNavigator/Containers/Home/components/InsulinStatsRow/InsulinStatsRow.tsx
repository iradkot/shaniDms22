// InsulinStatsRow.tsx
import React from 'react';
import styled from 'styled-components/native';
import { GradientColumnComponent } from './GradientColumnComponent';
import { computeInsulinStats } from './InsulinDataCalculations';
import { InsulinDataEntry, BasalProfile } from 'app/types/insulin.types';

const Container = styled.View`
    background-color: ${props => props.theme.backgroundColor};
    padding: 10px;
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
        gradientColors={['#36D1DC', '#5B86E5']} // Blue gradient
      />
      <GradientColumnComponent
        label="Total Bolus"
        value={`${stats.totalBolus.toFixed(2)} U`}
        iconName="needle"
        gradientColors={['#FF512F', '#DD2476']} // Red gradient
      />
      <GradientColumnComponent
        label="Basal/Bolus Ratio"
        value={`${basalRatioPercentage.toFixed(1)}%`}
        progress={basalRatioPercentage}
        gradientColors={['#00b09b', '#96c93d']} // Green gradient
      />
      <GradientColumnComponent
        label="Total Insulin"
        value={`${stats.totalInsulin.toFixed(2)} U`}
        iconName="calculator"
        gradientColors={['#f7971e', '#ffd200']} // Yellow gradient
      />
    </Container>
  );
};

export default InsulinStatsRow;
