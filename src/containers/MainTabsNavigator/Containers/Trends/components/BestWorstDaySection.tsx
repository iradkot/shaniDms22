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
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

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
  const {language} = useAppLanguage();
  return (
    <Collapsable title={tr(language, 'trends.selectMetricTitle')}>
      <ExplanationText>{tr(language, 'trends.selectMetricHint')}</ExplanationText>
      <MetricSelector>
        <MetricButton
          selected={selectedMetric === 'tir'}
          onPress={() => setSelectedMetric('tir')}
        >
          <MetricButtonText>{tr(language, 'trends.metricTir')}</MetricButtonText>
        </MetricButton>
        <MetricButton
          selected={selectedMetric === 'hypos'}
          onPress={() => setSelectedMetric('hypos')}
        >
          <MetricButtonText>{tr(language, 'trends.metricFewestHypos')}</MetricButtonText>
        </MetricButton>
        <MetricButton
          selected={selectedMetric === 'hypers'}
          onPress={() => setSelectedMetric('hypers')}
        >
          <MetricButtonText>{tr(language, 'trends.metricFewestHypers')}</MetricButtonText>
        </MetricButton>
      </MetricSelector>

      {/* Possibly show best/worst day details here or import DayInsights */}
    </Collapsable>
  );
};
