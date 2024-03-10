// InsulinStatsRow.tsx
import React from 'react';
import styled from 'styled-components/native';
import {GradientColumnComponent} from './GradientColumnComponent';
import {computeInsulinStats} from './InsulinDataCalculations';
import {InsulinDataEntry, BasalProfile} from 'app/types/insulin.types'; // Adjust import path as needed

const Container = styled.View`
  background-color: ${props => props.theme.backgroundColor};
  padding: 10px;
  flex-direction: row;
  justify-content: space-around;
`;

interface InsulinStatsRowProps {
  insulinData: InsulinDataEntry[];
  basalProfileData: BasalProfile;
}

export const InsulinStatsRow: React.FC<InsulinStatsRowProps> = ({
  insulinData,
  basalProfileData,
}) => {
  console.log('1', insulinData);
  const stats = computeInsulinStats(insulinData, basalProfileData);

  return (
    <Container>
      <GradientColumnComponent
        label="Total Basal"
        value={`${stats.totalBasal.toFixed(2)} U`}
      />
      <GradientColumnComponent
        label="Total Bolus"
        value={`${stats.totalBolus.toFixed(2)} U`}
      />
      <GradientColumnComponent
        label="Basal/Bolus Ratio"
        value={stats.basalBolusRatio.toFixed(2)}
      />
    </Container>
  );
};

export default InsulinStatsRow;
