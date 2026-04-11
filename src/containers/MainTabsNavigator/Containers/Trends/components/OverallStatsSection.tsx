import {useAppTheme} from 'app/hooks/useAppTheme';
// /Trends/components/OverallStatsSection.tsx

import React from 'react';
import {View} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

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
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

interface Props {
  metrics: ReturnType<typeof calculateTrendsMetrics>;
}

export const OverallStatsSection: React.FC<Props> = ({metrics}) => {
  const theme = useAppTheme();
  const {language} = useAppLanguage();

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
          <StatLabel>{tr(language, 'trends.overallAvgTitle')}</StatLabel>
        </Row>
        <StatValue>
          {metrics.averageBg.toFixed(1)} mg/dL (±{metrics.stdDev.toFixed(1)})
        </StatValue>
        <ExplanationText>
          {tr(language, 'trends.overallAvgHint')}
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
          <StatLabel>{tr(language, 'trends.overallSeriousHyposTitle')}</StatLabel>
        </Row>
        <StatValue color={theme.belowRangeColor}>
          {metrics.seriousHyposCount} total
        </StatValue>
        <ExplanationText>
          {tr(language, 'trends.overallSeriousHyposHint')}
        </ExplanationText>
      </OverallStatsItem>

      {/* Add more tiles for Serious Hypers, Morning Avg, etc. */}
      {/* ... */}
    </OverallStatsGrid>
  );
};
