// /Trends/TrendsUI.tsx

import React from 'react';
import Collapsable from 'app/components/Collapsable';
import { DayDetail } from './utils/trendsCalculations';
import {useTheme} from 'styled-components/native';
import {addOpacity} from 'app/style/styling.utils';
import {ThemeType} from 'app/types/theme';
import {useAppLanguage} from 'app/contexts/AppLanguageContext';
import {t as tr} from 'app/i18n/translations';

import {
  HighlightBox,
  BoldText,
  StatRow,
  StatLabel,
  StatValue,
  ExplanationText,
  Row
} from './styles/Trends.styles';

interface DayInsightsProps {
  bestDayDetail: DayDetail | null;
  worstDayDetail: DayDetail | null;
  bestDay: string;
  worstDay: string;
  selectedMetric: string;
}

export const DayInsights: React.FC<DayInsightsProps> = ({
  bestDayDetail,
  worstDayDetail,
  bestDay,
  worstDay,
  selectedMetric,
}) => {
  if (!bestDayDetail && !worstDayDetail) return null;

  const theme = useTheme() as ThemeType;
  const {language} = useAppLanguage();

  const bestMetricLabel = selectedMetric === 'tir'
    ? tr(language, 'trends.highestTir')
    : selectedMetric === 'hypos'
      ? tr(language, 'trends.fewestHypos')
      : tr(language, 'trends.fewestHypers');

  const worstMetricLabel = selectedMetric === 'tir'
    ? tr(language, 'trends.lowestTir')
    : selectedMetric === 'hypos'
      ? tr(language, 'trends.mostHypos')
      : tr(language, 'trends.mostHypers');

  return (
    <Collapsable title={tr(language, 'trends.dayQualityPatterns')}>
      {!!bestDayDetail && (
        <HighlightBox>
          <Row>
            <BoldText>{tr(language, 'trends.bestDay', {metric: bestMetricLabel})} </BoldText>
            <StatLabel>{bestDay || tr(language, 'trends.na')}</StatLabel>
          </Row>
          <ExplanationText>
            {tr(language, 'trends.daySummaryLine', {
              tir: (bestDayDetail.tir * 100).toFixed(1),
              hypos: bestDayDetail.seriousHypos,
              hypers: bestDayDetail.seriousHypers,
            })}
          </ExplanationText>
        </HighlightBox>
      )}

      {!!worstDayDetail && (
        <HighlightBox
          style={{
            backgroundColor: addOpacity(theme.belowRangeColor, 0.12),
            borderLeftColor: theme.belowRangeColor,
          }}
        >
          <Row>
            <BoldText>{tr(language, 'trends.worstDay', {metric: worstMetricLabel})} </BoldText>
            <StatLabel>{worstDay || tr(language, 'trends.na')}</StatLabel>
          </Row>
          <ExplanationText>
            {tr(language, 'trends.daySummaryLine', {
              tir: (worstDayDetail.tir * 100).toFixed(1),
              hypos: worstDayDetail.seriousHypos,
              hypers: worstDayDetail.seriousHypers,
            })}
          </ExplanationText>
        </HighlightBox>
      )}

      {!!bestDayDetail && (
        <Collapsable title={tr(language, 'trends.bestDayInsights')}>
          <StatRow><StatLabel>{tr(language, 'trends.date')}</StatLabel><StatValue>{bestDayDetail.dateString}</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.avgBgLabel')}</StatLabel><StatValue>{bestDayDetail.avg.toFixed(1)} mg/dL</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.tirPctLabel')}</StatLabel><StatValue>{(bestDayDetail.tir * 100).toFixed(1)}%</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.minBgLabel')}</StatLabel><StatValue>{bestDayDetail.minBg} mg/dL</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.maxBgLabel')}</StatLabel><StatValue>{bestDayDetail.maxBg} mg/dL</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.timeBelowRange')}</StatLabel><StatValue color={theme.belowRangeColor}>{bestDayDetail.timeBelowRange.toFixed(1)}%</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.timeAboveRange')}</StatLabel><StatValue color={theme.aboveRangeColor}>{bestDayDetail.timeAboveRange.toFixed(1)}%</StatValue></StatRow>
          <ExplanationText>{tr(language, 'trends.bestDayTip')}</ExplanationText>
        </Collapsable>
      )}

      {!!worstDayDetail && (
        <Collapsable title={tr(language, 'trends.worstDayInsights')}>
          <StatRow><StatLabel>{tr(language, 'trends.date')}</StatLabel><StatValue>{worstDayDetail.dateString}</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.avgBgLabel')}</StatLabel><StatValue>{worstDayDetail.avg.toFixed(1)} mg/dL</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.tirPctLabel')}</StatLabel><StatValue>{(worstDayDetail.tir * 100).toFixed(1)}%</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.minBgLabel')}</StatLabel><StatValue>{worstDayDetail.minBg} mg/dL</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.maxBgLabel')}</StatLabel><StatValue>{worstDayDetail.maxBg} mg/dL</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.timeBelowRange')}</StatLabel><StatValue color={theme.belowRangeColor}>{worstDayDetail.timeBelowRange.toFixed(1)}%</StatValue></StatRow>
          <StatRow><StatLabel>{tr(language, 'trends.timeAboveRange')}</StatLabel><StatValue color={theme.aboveRangeColor}>{worstDayDetail.timeAboveRange.toFixed(1)}%</StatValue></StatRow>
          <ExplanationText>{tr(language, 'trends.worstDayTip')}</ExplanationText>
        </Collapsable>
      )}
    </Collapsable>
  );
};
