// /Trends/components/BestWorstDaySection.tsx

import React from 'react';
import Collapsable from 'app/components/Collapsable';
import { DayDetail } from '../utils/trendsCalculations';
import {
  ExplanationText,
  MetricSelector,
  MetricButton,
  MetricButtonText,
} from '../styles/Trends.styles';

interface BestWorstDayProps {
  selectedMetric: string;
  setSelectedMetric: (val: string) => void;
  displayDays: DayDetail[];
}

export const BestWorstDaySection: React.FC<BestWorstDayProps> = ({
                                                                   selectedMetric,
                                                                   setSelectedMetric,
                                                                   displayDays
                                                                 }) => {
  return (
    <Collapsable title="Select Metric for Best/Worst Day">
      <ExplanationText>Choose how to determine best/worst day:</ExplanationText>
      <MetricSelector>
        <MetricButton
          selected={selectedMetric === 'tir'}
          onPress={() => setSelectedMetric('tir')}
        >
          <MetricButtonText>TIR</MetricButtonText>
        </MetricButton>
        <MetricButton
          selected={selectedMetric === 'hypos'}
          onPress={() => setSelectedMetric('hypos')}
        >
          <MetricButtonText>Fewest Hypos</MetricButtonText>
        </MetricButton>
        <MetricButton
          selected={selectedMetric === 'hypers'}
          onPress={() => setSelectedMetric('hypers')}
        >
          <MetricButtonText>Fewest Hypers</MetricButtonText>
        </MetricButton>
      </MetricSelector>

      {/* Possibly show best/worst day details here or import DayInsights */}
    </Collapsable>
  );
};
