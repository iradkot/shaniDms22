// /Trends/components/CompareSection.tsx
import React from 'react';
import { View, Button, ActivityIndicator } from 'react-native';
import {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {
  CompareBox,
  ExplanationText,
  StatRow,
  StatLabel,
  StatValue,
  Subtle,
  ComparisonTitle,
  ComparisonSubtitle,
  StatChange,
  ComparisonDateRange,
} from '../styles/Trends.styles';
import { calculateTrendsMetrics } from '../utils/trendsCalculations';

interface CompareSectionProps {
  showComparison: boolean;
  comparing: boolean;
  handleCompare: () => void;
  rangeDays: number;
  currentMetrics: ReturnType<typeof calculateTrendsMetrics>;
  previousMetrics: ReturnType<typeof calculateTrendsMetrics> | null;
  comparisonDateRange: { start: Date; end: Date } | null;
  changeComparisonPeriod: (direction: 'back' | 'forward') => void;
  hideComparison: () => void;
}

export const CompareSection: React.FC<CompareSectionProps> = ({
  showComparison,
  comparing,
  handleCompare,
  rangeDays,
  currentMetrics,
  previousMetrics,
  comparisonDateRange,
  changeComparisonPeriod,
  hideComparison,
}) => {
  const theme = useTheme() as ThemeType;

  if (!currentMetrics.dailyDetails.length) return null;

  const renderComparisonValue = (
    current: number,
    previous: number,
    unit: string,
    lowerIsBetter = false,
  ) => {
    const diff = current - previous;
    const diffPercentage = previous !== 0 ? (diff / previous) * 100 : 0;

    const isImprovement = diff > 0 ? lowerIsBetter : !lowerIsBetter;
    const color = isImprovement ? theme.inRangeColor : theme.belowRangeColor;

    return (
      <View>
        <StatValue>
          {current.toFixed(1)} {unit}
        </StatValue>
        <Subtle>
          vs {previous.toFixed(1)} {unit}
        </Subtle>
        <StatChange color={color}>
          {diff.toFixed(1)} ({diffPercentage.toFixed(0)}%)
        </StatChange>
      </View>
    );
  };

  return (
    <View style={{ marginVertical: theme.spacing.sm + 2 }}>
      {!showComparison && !comparing && (
        <Button
          title="Compare With Previous Period"
          onPress={handleCompare}
          color={theme.accentColor}
        />
      )}
      {comparing && <ActivityIndicator size="large" color={theme.accentColor} />}

      {showComparison && previousMetrics && comparisonDateRange && (
        <CompareBox>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}>
            <ComparisonTitle>Comparison</ComparisonTitle>
            <Button
              title="Hide"
              onPress={hideComparison}
              color={theme.belowRangeColor}
            />
          </View>
          <ComparisonSubtitle>
            Current vs. Another {rangeDays}-Day Period
          </ComparisonSubtitle>
          <ComparisonDateRange>
            {comparisonDateRange.start.toDateString()} -{' '}
            {comparisonDateRange.end.toDateString()}
          </ComparisonDateRange>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-around',
              marginBottom: theme.spacing.sm + 2,
            }}>
            <Button
              title="< Shift Back"
              onPress={() => changeComparisonPeriod('back')}
            />
            <Button
              title="Shift Forward >"
              onPress={() => changeComparisonPeriod('forward')}
            />
          </View>

          <StatRow>
            <StatLabel>Average BG</StatLabel>
            {renderComparisonValue(
              currentMetrics.averageBg,
              previousMetrics.averageBg,
              'mg/dL',
              true,
            )}
          </StatRow>

          <StatRow>
            <StatLabel>Time in Range (TIR)</StatLabel>
            {renderComparisonValue(
              currentMetrics.tir,
              previousMetrics.tir,
              '%',
            )}
          </StatRow>

          <StatRow>
            <StatLabel>Serious Hypos/Day</StatLabel>
            {renderComparisonValue(
              currentMetrics.seriousHyposCount / rangeDays,
              previousMetrics.seriousHyposCount / rangeDays,
              'events/day',
              true,
            )}
          </StatRow>

          <StatRow>
            <StatLabel>Serious Hypers/Day</StatLabel>
            {renderComparisonValue(
              currentMetrics.seriousHypersCount / rangeDays,
              previousMetrics.seriousHypersCount / rangeDays,
              'events/day',
              true,
            )}
          </StatRow>

          <ExplanationText style={{ marginTop: theme.spacing.lg - 1 }}>
            Green indicates an improvement, while red suggests a decline. Use
            these insights to adjust your diabetes management plan.
          </ExplanationText>
        </CompareBox>
      )}
    </View>
  );
};
