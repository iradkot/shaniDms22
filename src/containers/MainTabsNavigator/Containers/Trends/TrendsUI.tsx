// /Users/iradkotton/projects/shaniDms22/src/containers/MainTabsNavigator/Containers/Trends/TrendsUI.tsx

import React from 'react';
import { Dimensions, View } from "react-native";
import Collapsable from "app/components/Collapsable";
import BgGraph from "app/components/CgmGraph/CgmGraph";
import { DayDetail } from './trendsCalculations';
import {
  StatRow,
  StatLabel,
  StatValue,
  ExplanationText,
  HighlightBox,
  BoldText,
  InteractiveRow,
  InteractiveRowText,
  Row
} from './Trends.styles';

const { width: screenWidth } = Dimensions.get('window');

interface DayInsightsProps {
  bestDayDetail: DayDetail | null;
  worstDayDetail: DayDetail | null;
  bestDay: string;
  worstDay: string;
  selectedMetric: string;
  showBestDayDetails: boolean;
  setShowBestDayDetails: (val: boolean) => void;
  showWorstDayDetails: boolean;
  setShowWorstDayDetails: (val: boolean) => void;
}

export const DayInsights = ({
                              bestDayDetail,
                              worstDayDetail,
                              bestDay,
                              worstDay,
                              selectedMetric,
                            }: DayInsightsProps) => {
  const bestMetricLabel = selectedMetric === 'tir' ? 'Highest TIR'
    : selectedMetric === 'hypos' ? 'Fewest Hypos'
      : 'Fewest Hypers';

  const worstMetricLabel = selectedMetric === 'tir' ? 'Lowest TIR'
    : selectedMetric === 'hypos' ? 'Most Hypos'
      : 'Most Hypers';

  return (
    <Collapsable title="Day Quality & Patterns">
      {/* Best Day Section */}
      <HighlightBox>
        <Row>
          <BoldText>Best Day ({bestMetricLabel}): </BoldText>
          <StatLabel>{bestDay || "N/A"}</StatLabel>
        </Row>
        {bestDayDetail && (
          <ExplanationText>
            TIR: {(bestDayDetail.tir * 100).toFixed(1)}% | Hypos: {bestDayDetail.seriousHypos} | Hypers: {bestDayDetail.seriousHypers}
          </ExplanationText>
        )}
      </HighlightBox>

      {/* Worst Day Section */}
      <HighlightBox style={{ backgroundColor: "#fff1f0", borderLeftColor: "#ff4d4f" }}>
        <Row>
          <BoldText>Worst Day ({worstMetricLabel}): </BoldText>
          <StatLabel>{worstDay || "N/A"}</StatLabel>
        </Row>
        {worstDayDetail && (
          <ExplanationText>
            TIR: {(worstDayDetail.tir * 100).toFixed(1)}% | Hypos: {worstDayDetail.seriousHypos} | Hypers: {worstDayDetail.seriousHypers}
          </ExplanationText>
        )}
      </HighlightBox>

      {/* Best Day Insights */}
      {bestDayDetail  && (
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
            <StatLabel>TIR:</StatLabel>
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
            <StatLabel>Time In Range:</StatLabel>
            <StatValue>{bestDayDetail.timeInRange.toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Below Range:</StatLabel>
            <StatValue color="red">{bestDayDetail.timeBelowRange.toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Above Range:</StatLabel>
            <StatValue color="orange">{bestDayDetail.timeAboveRange.toFixed(1)}%</StatValue>
          </StatRow>
          <ExplanationText>Stable overnight? Good meal timing? Learn from this pattern.</ExplanationText>

          <View style={{ marginTop: 10 }}>
            <BgGraph
              bgSamples={bestDayDetail.samples}
              width={screenWidth - 40}
              height={200}
              foodItems={null}
            />
          </View>
        </Collapsable>
      )}

      {/* Worst Day Insights */}
      {worstDayDetail && (
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
            <StatLabel>TIR:</StatLabel>
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
            <StatLabel>Time In Range:</StatLabel>
            <StatValue>{worstDayDetail.timeInRange.toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Below Range:</StatLabel>
            <StatValue color="red">{worstDayDetail.timeBelowRange.toFixed(1)}%</StatValue>
          </StatRow>
          <StatRow>
            <StatLabel>Time Above Range:</StatLabel>
            <StatValue color="orange">{worstDayDetail.timeAboveRange.toFixed(1)}%</StatValue>
          </StatRow>
          <ExplanationText>Identify causes: Late meals? Missed bolus? Stress?</ExplanationText>

          <View style={{ marginTop: 10 }}>
            <BgGraph
              bgSamples={worstDayDetail.samples}
              width={screenWidth - 40}
              height={200}
              foodItems={null}
            />
          </View>
        </Collapsable>
      )}
    </Collapsable>
  );
};
