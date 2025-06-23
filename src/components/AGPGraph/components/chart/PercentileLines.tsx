// Percentile Lines Component

import React from 'react';
import { G, Path } from 'react-native-svg';
import { AGP_COLORS, AGP_PERCENTILE_COLORS } from '../../utils/constants';
import { theme } from '../../../../style/theme';

interface PercentileLinesProps {
  percentileLines: {
    p5: string;
    p25: string;
    p50: string;
    p75: string;
    p95: string;
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

export const PercentileLines: React.FC<PercentileLinesProps> = ({
  percentileLines,
  agpData
}) => {
  if (!percentileLines) return null;

  // Calculate average glucose values for each percentile to determine colors
  const getAverageGlucose = (percentile: 'p5' | 'p25' | 'p75' | 'p95') => {
    if (!agpData?.percentiles) return 100; // Default fallback
    
    const values = agpData.percentiles.map(p => p[percentile]);
    return values.reduce((sum, val) => sum + val, 0) / values.length;
  };

  return (
    <G>
      {percentileLines.p5 && (
        <Path
          d={percentileLines.p5}
          stroke={theme.determineBgColorByGlucoseValue(getAverageGlucose('p5'))}
          strokeWidth={1}
          fill="none"
          strokeDasharray="2,2"
        />
      )}
      {percentileLines.p95 && (
        <Path
          d={percentileLines.p95}
          stroke={theme.determineBgColorByGlucoseValue(getAverageGlucose('p95'))}
          strokeWidth={1}
          fill="none"
          strokeDasharray="2,2"
        />
      )}
      
      {percentileLines.p25 && (
        <Path
          d={percentileLines.p25}
          stroke={theme.determineBgColorByGlucoseValue(getAverageGlucose('p25'))}
          strokeWidth={1.5}
          fill="none"
          strokeDasharray="4,2"
        />
      )}
      {percentileLines.p75 && (
        <Path
          d={percentileLines.p75}
          stroke={theme.determineBgColorByGlucoseValue(getAverageGlucose('p75'))}
          strokeWidth={1.5}
          fill="none"
          strokeDasharray="4,2"
        />
      )}
      
      {percentileLines.p50 && (
        <Path
          d={percentileLines.p50}
          stroke={AGP_PERCENTILE_COLORS.median}
          strokeWidth={2.5}
          fill="none"
        />
      )}
    </G>
  );
};

export default PercentileLines;
