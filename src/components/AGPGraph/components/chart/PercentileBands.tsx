// Percentile Bands Component

import React from 'react';
import { G, Path } from 'react-native-svg';
import { theme } from '../../../../style/theme';

interface PercentileBandsProps {
  percentileBands: {
    p5_p95: string;
    p25_p75: string;
  } | null;
  agpData?: {
    percentiles: Array<{
      timeOfDay: number;
      p5: number;
      p25: number;
      p50: number;
      p75: number;
      p95: number;
    }>;
  } | null;
}

export const PercentileBands: React.FC<PercentileBandsProps> = ({
  percentileBands,
  agpData
}) => {
  if (!percentileBands) return null;
  // Calculate average glucose for color determination
  const getAverageGlucose = () => {
    if (!agpData?.percentiles) return 100;
    
    const allValues: number[] = [];
    agpData.percentiles.forEach(p => {
      allValues.push(p.p25, p.p50, p.p75);
    });
    
    return allValues.reduce((sum: number, val: number) => sum + val, 0) / allValues.length;
  };

  const avgGlucose = getAverageGlucose();
  const bandColor = theme.determineBgColorByGlucoseValue(avgGlucose);

  return (
    <G>
      {percentileBands.p5_p95 && (
        <Path
          d={percentileBands.p5_p95}
          fill={bandColor}
          opacity={0.15}
        />
      )}
      
      {percentileBands.p25_p75 && (
        <Path
          d={percentileBands.p25_p75}
          fill={bandColor}
          opacity={0.25}
        />
      )}
    </G>
  );
};

export default PercentileBands;
