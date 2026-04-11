import React from 'react';
import {View} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import {ThemeType} from 'app/types/theme';
import {ImpactAnalysisResult} from 'app/types/loopAnalysis.types';
import {addOpacity} from 'app/style/styling.utils';

// ─────────────────────────────────────────────────────────────────────────────
// Styled Components
// ─────────────────────────────────────────────────────────────────────────────

const Card = styled.View<{theme: ThemeType; $borderColor: string}>`
  background-color: ${(p: {theme: ThemeType}) => p.theme.white};
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius}px;
  border-width: 1px;
  border-color: ${(p: {theme: ThemeType}) => p.theme.borderColor};
  border-left-width: 4px;
  border-left-color: ${(p: {$borderColor: string}) => p.$borderColor};
  padding: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
`;

const VerdictRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const VerdictIcon = styled.Text<{theme: ThemeType}>`
  font-size: 24px;
  margin-right: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

const VerdictText = styled.Text<{theme: ThemeType; $color: string}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.md}px;
  font-weight: 800;
  color: ${(p: {$color: string}) => p.$color};
`;

const SummaryText = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.sm}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.8)};
  line-height: 20px;
`;

const QualityRow = styled.View<{theme: ThemeType}>`
  flex-direction: row;
  align-items: center;
  margin-top: ${(p: {theme: ThemeType}) => p.theme.spacing.md}px;
  padding-top: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  border-top-width: 1px;
  border-top-color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.borderColor, 0.5)};
`;

const QualityBadge = styled.View<{theme: ThemeType; $color: string}>`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
  padding-vertical: ${(p: {theme: ThemeType}) => p.theme.spacing.xs}px;
  border-radius: ${(p: {theme: ThemeType}) => p.theme.borderRadius / 2}px;
  background-color: ${(p: {$color: string}) => addOpacity(p.$color, 0.1)};
`;

const QualityText = styled.Text<{theme: ThemeType; $color: string}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  font-weight: 600;
  color: ${(p: {$color: string}) => p.$color};
`;

const QualityLabel = styled.Text<{theme: ThemeType}>`
  font-size: ${(p: {theme: ThemeType}) => p.theme.typography.size.xs}px;
  color: ${(p: {theme: ThemeType}) => addOpacity(p.theme.textColor, 0.6)};
  margin-left: ${(p: {theme: ThemeType}) => p.theme.spacing.sm}px;
`;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface ImpactSummaryCardProps {
  result: ImpactAnalysisResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getVerdictInfo(trend: ImpactAnalysisResult['deltas']['overallTrend']): {
  icon: string;
  label: string;
  color: string;
} {
  switch (trend) {
    case 'improved':
      return {icon: '✅', label: 'Improved', color: '#34C759'};
    case 'worsened':
      return {icon: '⚠️', label: 'Worsened', color: '#FF3B30'};
    case 'mixed':
      return {icon: '🔄', label: 'Mixed Results', color: '#FF9500'};
    case 'neutral':
    default:
      return {icon: '➖', label: 'No Significant Change', color: '#8E8E93'};
  }
}

function getQualityInfo(hasEnoughData: boolean): {
  label: string;
  color: string;
} {
  return hasEnoughData
    ? {label: 'Good', color: '#34C759'}
    : {label: 'Insufficient', color: '#FF9500'};
}

function generateSummaryText(result: ImpactAnalysisResult): string {
  const parts: string[] = [];

  // TIR change
  const tirDelta = result.deltas.tirDelta;
  if (Math.abs(tirDelta) >= 1) {
    const direction = tirDelta > 0 ? 'increased' : 'decreased';
    parts.push(`Time in Range ${direction} by ${Math.abs(tirDelta).toFixed(1)} percentage points`);
  }

  // Mean change
  const avgBgDelta = result.deltas.avgBgDelta;
  if (avgBgDelta != null && Math.abs(avgBgDelta) >= 5) {
    const direction = avgBgDelta > 0 ? 'increased' : 'decreased';
    parts.push(`average glucose ${direction} by ${Math.abs(avgBgDelta).toFixed(0)} mg/dL`);
  }

  // CV change
  const cvDelta = result.deltas.cvDelta;
  if (cvDelta != null && Math.abs(cvDelta) >= 2) {
    const direction = cvDelta > 0 ? 'increased' : 'decreased';
    parts.push(`variability ${direction}`);
  }

  // Hypo count change
  const hypoCountDelta = result.deltas.hypoCountDelta;
  if (Math.abs(hypoCountDelta) >= 1) {
    const direction = hypoCountDelta > 0 ? 'increased' : 'decreased';
    parts.push(`hypo events ${direction} by ${Math.abs(hypoCountDelta)}`);
  }

  if (parts.length === 0) {
    return 'No significant changes in glucose metrics detected during this period.';
  }

  // Join with proper grammar
  if (parts.length === 1) {
    return `After this settings change, ${parts[0]}.`;
  }
  const last = parts.pop();
  return `After this settings change, ${parts.join(', ')}, and ${last}.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export const ImpactSummaryCard: React.FC<ImpactSummaryCardProps> = ({result}) => {
  const theme = useTheme() as ThemeType;
  const verdictInfo = getVerdictInfo(result.deltas.overallTrend);
  const qualityInfo = getQualityInfo(result.dataQuality.hasEnoughData);
  const summaryText = generateSummaryText(result);

  return (
    <Card $borderColor={verdictInfo.color}>
      <VerdictRow>
        <VerdictIcon>{verdictInfo.icon}</VerdictIcon>
        <VerdictText $color={verdictInfo.color}>{verdictInfo.label}</VerdictText>
      </VerdictRow>

      <SummaryText>{summaryText}</SummaryText>

      <QualityRow>
        <QualityBadge $color={qualityInfo.color}>
          <QualityText $color={qualityInfo.color}>
            Data Quality: {qualityInfo.label}
          </QualityText>
        </QualityBadge>
        <QualityLabel>
          {(result.dataQuality.prePeriodCoverage * 100).toFixed(0)}% / {(result.dataQuality.postPeriodCoverage * 100).toFixed(0)}% coverage
        </QualityLabel>
      </QualityRow>
    </Card>
  );
};
