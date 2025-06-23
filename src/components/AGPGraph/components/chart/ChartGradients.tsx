// Chart Gradients Component

import React from 'react';
import { Defs, LinearGradient, Stop } from 'react-native-svg';
import { AGP_PERCENTILE_COLORS } from '../../utils/constants';

export const ChartGradients: React.FC = () => {
  return (
    <Defs>
      <LinearGradient id="p5p95Gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <Stop offset="0%" stopColor={AGP_PERCENTILE_COLORS.p5_p95} />
        <Stop offset="100%" stopColor={AGP_PERCENTILE_COLORS.p5_p95} />
      </LinearGradient>
      <LinearGradient id="p25p75Gradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <Stop offset="0%" stopColor={AGP_PERCENTILE_COLORS.p25_p75} />
        <Stop offset="100%" stopColor={AGP_PERCENTILE_COLORS.p25_p75} />
      </LinearGradient>
    </Defs>
  );
};

export default ChartGradients;
