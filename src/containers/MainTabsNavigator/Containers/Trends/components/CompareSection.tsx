// /Trends/components/CompareSection.tsx
import React from 'react';
import { View, Button, ActivityIndicator } from 'react-native';
import {
  BoldText,
  CompareBox,
  ExplanationText,
  StatRow,
  StatLabel,
  StatValue
} from '../styles/Trends.styles';
import { calculateTrendsMetrics } from '../utils/trendsCalculations';

interface CompareSectionProps {
  showComparison: boolean;
  comparing: boolean;
  handleCompare: () => void;
  rangeDays: number;
  currentMetrics: ReturnType<typeof calculateTrendsMetrics>;
  previousMetrics: ReturnType<typeof calculateTrendsMetrics> | null;
}

export const CompareSection: React.FC<CompareSectionProps> = ({
                                                                showComparison,
                                                                comparing,
                                                                handleCompare,
                                                                rangeDays,
                                                                currentMetrics,
                                                                previousMetrics,
                                                              }) => {
  if (!currentMetrics.dailyDetails.length) return null;

  return (
    <View style={{ marginVertical: 10 }}>
      {!showComparison && !comparing && (
        <Button title="Compare with previous period" onPress={handleCompare} />
      )}
      {comparing && <ActivityIndicator size="small" color="#000" />}

      {showComparison && previousMetrics && (
        <CompareBox>
          <BoldText>Comparison:</BoldText>
          <ExplanationText>
            Comparing this {rangeDays}-day period to the previous {rangeDays}-day period.
          </ExplanationText>

          <StatRow>
            <StatLabel>Avg BG Difference:</StatLabel>
            <StatValue>
              {currentMetrics.averageBg.toFixed(1)} vs {previousMetrics.averageBg.toFixed(1)} mg/dL
              ({(currentMetrics.averageBg - previousMetrics.averageBg).toFixed(1)})
            </StatValue>
          </StatRow>

          <StatRow>
            <StatLabel>Serious Hypos/Day Difference:</StatLabel>
            <StatValue>
              {(currentMetrics.seriousHyposCount / rangeDays).toFixed(2)} vs{' '}
              {(previousMetrics.seriousHyposCount / rangeDays).toFixed(2)}
            </StatValue>
          </StatRow>

          <StatRow>
            <StatLabel>Serious Hypers/Day Difference:</StatLabel>
            <StatValue>
              {(currentMetrics.seriousHypersCount / rangeDays).toFixed(2)} vs{' '}
              {(previousMetrics.seriousHypersCount / rangeDays).toFixed(2)}
            </StatValue>
          </StatRow>

          <ExplanationText>
            Are things improving or getting worse? Adjust accordingly.
          </ExplanationText>
        </CompareBox>
      )}
    </View>
  );
};
