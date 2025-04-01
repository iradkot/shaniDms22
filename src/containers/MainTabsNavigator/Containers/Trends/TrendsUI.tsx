// /Trends/TrendsUI.tsx

import React from 'react';
import { View, Dimensions } from 'react-native';
import Collapsable from 'app/components/Collapsable';
import { DayDetail } from './utils/trendsCalculations';

// OPTIONAL: If you have a BG graph component
// import BgGraph from 'app/components/CgmGraph/CgmGraph';

import {
  HighlightBox,
  BoldText,
  StatRow,
  StatLabel,
  StatValue,
  ExplanationText,
  Row
} from './styles/Trends.styles';

const { width: screenWidth } = Dimensions.get('window');

interface DayInsightsProps {
  bestDayDetail: DayDetail | null;
  worstDayDetail: DayDetail | null;
  bestDay: string;
  worstDay: string;
  selectedMetric: string;
}

/**
 * Renders a collapsable with "Best Day" and "Worst Day" highlights,
 * plus sub-collapsables with deeper insights for each day.
 */
export const DayInsights: React.FC<DayInsightsProps> = ({
                                                          bestDayDetail,
                                                          worstDayDetail,
                                                          bestDay,
                                                          worstDay,
                                                          selectedMetric,
                                                        }) => {
  if (!bestDayDetail && !worstDayDetail) return null;

  // Label text for "best" and "worst" day, depending on selected metric
  const bestMetricLabel = selectedMetric === 'tir' ? 'Highest TIR'
    : selectedMetric === 'hypos' ? 'Fewest Hypos'
      : 'Fewest Hypers';

  const worstMetricLabel = selectedMetric === 'tir' ? 'Lowest TIR'
    : selectedMetric === 'hypos' ? 'Most Hypos'
      : 'Most Hypers';

  return (
    <Collapsable title="Day Quality & Patterns">
      {/* Best Day Section */}
      {!!bestDayDetail && (
        <HighlightBox>
          <Row>
            <BoldText>Best Day ({bestMetricLabel}): </BoldText>
            <StatLabel>{bestDay || "N/A"}</StatLabel>
          </Row>
          <ExplanationText>
            TIR: {(bestDayDetail.tir * 100).toFixed(1)}% | Hypos: {bestDayDetail.seriousHypos} | Hypers: {bestDayDetail.seriousHypers}
          </ExplanationText>
        </HighlightBox>
      )}

      {/* Worst Day Section */}
      {!!worstDayDetail && (
        <HighlightBox style={{ backgroundColor: "#fff1f0", borderLeftColor: "#ff4d4f" }}>
          <Row>
            <BoldText>Worst Day ({worstMetricLabel}): </BoldText>
            <StatLabel>{worstDay || "N/A"}</StatLabel>
          </Row>
          <ExplanationText>
            TIR: {(worstDayDetail.tir * 100).toFixed(1)}% | Hypos: {worstDayDetail.seriousHypos} | Hypers: {worstDayDetail.seriousHypers}
          </ExplanationText>
        </HighlightBox>
      )}

      {/* Best Day Insights */}
      {!!bestDayDetail && (
        <Collapsable title="Best Day Insights">
          <StatRow>
            <StatLabel>Date:</StatLabel>
            <StatValue>{bestDayDetail.dateString}</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Avg BG:</StatLabel>
            <StatValue>{bestDayDetail.avg.toFixed(1)} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>TIR (%):</StatLabel>
            <StatValue>{(bestDayDetail.tir * 100).toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Min BG:</StatLabel>
            <StatValue>{bestDayDetail.minBg} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Max BG:</StatLabel>
            <StatValue>{bestDayDetail.maxBg} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Below Range:</StatLabel>
            <StatValue color="red">{bestDayDetail.timeBelowRange.toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Above Range:</StatLabel>
            <StatValue color="orange">{bestDayDetail.timeAboveRange.toFixed(1)}%</StatValue>
          </StatRow>
          <ExplanationText>
            Stable overnight? Good meal timing? Learn from this pattern.
          </ExplanationText>

          {/* Optional BG Graph example:
              <View style={{ marginTop: 10 }}>
                <BgGraph
                  bgSamples={bestDayDetail.samples}
                  width={screenWidth - 40}
                  height={200}
                  foodItems={null}
                />
              </View>
          */}
        </Collapsable>
      )}

      {/* Worst Day Insights */}
      {!!worstDayDetail && (
        <Collapsable title="Worst Day Insights">
          <StatRow>
            <StatLabel>Date:</StatLabel>
            <StatValue>{worstDayDetail.dateString}</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Avg BG:</StatLabel>
            <StatValue>{worstDayDetail.avg.toFixed(1)} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>TIR (%):</StatLabel>
            <StatValue>{(worstDayDetail.tir * 100).toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Min BG:</StatLabel>
            <StatValue>{worstDayDetail.minBg} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Max BG:</StatLabel>
            <StatValue>{worstDayDetail.maxBg} mg/dL</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Below Range:</StatLabel>
            <StatValue color="red">{worstDayDetail.timeBelowRange.toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Above Range:</StatLabel>
            <StatValue color="orange">{worstDayDetail.timeAboveRange.toFixed(1)}%</StatValue>
          </StatRow>
          <ExplanationText>
            Identify causes: Late meals? Missed bolus? Stress?
          </ExplanationText>

          {/* Optional BG Graph example:
              <View style={{ marginTop: 10 }}>
                <BgGraph
                  bgSamples={worstDayDetail.samples}
                  width={screenWidth - 40}
                  height={200}
                  foodItems={null}
                />
              </View>
          */}
        </Collapsable>
      )}
    </Collapsable>
  );
};
