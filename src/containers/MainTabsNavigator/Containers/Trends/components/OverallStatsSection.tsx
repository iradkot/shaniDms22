// /Trends/components/OverallStatsSection.tsx

import React from 'react';
import {View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {useTheme} from 'styled-components/native';

import {
  OverallStatsGrid,
  OverallStatsItem,
  Row,
  StatLabel,
  StatValue,
  ExplanationText,
} from '../styles/Trends.styles';
import {calculateTrendsMetrics} from '../utils/trendsCalculations';
import {ThemeType} from 'app/types/theme';

interface Props {
  metrics: ReturnType<typeof calculateTrendsMetrics>;
}

export const OverallStatsSection: React.FC<Props> = ({metrics}) => {
  const theme = useTheme() as ThemeType;

  if (!metrics.dailyDetails.length) return null;

  return (
    <OverallStatsGrid>
      {/* Example tile: Average BG */}
      <OverallStatsItem>
        <Row style={{alignItems: 'center', marginBottom: theme.spacing.xs + 1}}>
          <Icon
            name="chart-line"
            size={24}
            color={theme.textColor}
            style={{marginRight: theme.spacing.xs + 2}}
          />
          <StatLabel>Average BG</StatLabel>
        </Row>
        <StatValue>
          {metrics.averageBg.toFixed(1)} mg/dL (±{metrics.stdDev.toFixed(1)})
        </StatValue>
        <ExplanationText>
          Lower avg BG often means better control, but avoid hypos.
        </ExplanationText>
      </OverallStatsItem>

      {/* Another tile: Serious Hypos */}
      <OverallStatsItem>
        <Row style={{alignItems: 'center', marginBottom: theme.spacing.xs + 1}}>
          <Icon
            name="alert-octagon"
            size={24}
            color={theme.belowRangeColor}
            style={{marginRight: theme.spacing.xs + 2}}
          />
          <StatLabel>Serious Hypos</StatLabel>
        </Row>
        <StatValue color={theme.belowRangeColor}>
          {metrics.seriousHyposCount} total
        </StatValue>
        <ExplanationText>
          Hypos are dangerous. Aim to reduce these events.
        </ExplanationText>
      </OverallStatsItem>

      {/* Add more tiles for Serious Hypers, Morning Avg, etc. */}
      {/* ... */}
    </OverallStatsGrid>
  );
};
