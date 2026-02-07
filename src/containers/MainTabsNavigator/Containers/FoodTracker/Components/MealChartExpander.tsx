import React, {useMemo} from 'react';
import {View, useWindowDimensions} from 'react-native';
import styled, {useTheme} from 'styled-components/native';

import StackedHomeCharts from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import {MealChartData, MealEntry} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/types';
import {ChartExpanderContainer} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/styles';
import {ThemeType} from 'app/types/theme';
import {TimeInRangePercentages} from 'app/utils/glucose/timeInRange';

// ── Styled TIR bar ──────────────────────────────────

const TirSection = styled.View`
  padding: 8px 16px 4px;
`;

const TirTitle = styled.Text<{theme: ThemeType}>`
  font-size: 12px;
  font-weight: 600;
  color: ${({theme}) => theme.textColor};
  margin-bottom: 6px;
`;

const TirBarContainer = styled.View`
  flex-direction: row;
  height: 22px;
  border-radius: 6px;
  overflow: hidden;
`;

const TirSegment = styled.View<{pct: number; bg: string}>`
  width: ${({pct}) => `${pct}%`};
  background-color: ${({bg}) => bg};
  align-items: center;
  justify-content: center;
`;

const TirSegmentLabel = styled.Text`
  font-size: 10px;
  font-weight: 700;
  color: #fff;
`;

const TirLegendRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-top: 4px;
`;

const TirLegendItem = styled.Text<{theme: ThemeType}>`
  font-size: 10px;
  color: ${({theme}) => theme.textColor};
  opacity: 0.6;
`;

// ── Absorption bar styled components ─────────────────

const AbsorptionSection = styled.View`
  padding: 8px 16px 4px;
`;

const AbsorptionTitle = styled.Text<{theme: ThemeType}>`
  font-size: 12px;
  font-weight: 600;
  color: ${({theme}) => theme.textColor};
  margin-bottom: 6px;
`;

const AbsorptionBarBg = styled.View<{theme: ThemeType}>`
  height: 22px;
  border-radius: 6px;
  overflow: hidden;
  background-color: ${({theme}) => theme.secondaryColor};
`;

const AbsorptionBarFill = styled.View<{pct: number; bg: string}>`
  width: ${({pct}) => `${Math.min(pct, 100)}%`};
  height: 100%;
  border-radius: 6px;
  background-color: ${({bg}) => bg};
  align-items: center;
  justify-content: center;
`;

const AbsorptionBarLabel = styled.Text`
  font-size: 10px;
  font-weight: 700;
  color: #fff;
`;

const AbsorptionStatsRow = styled.View`
  flex-direction: row;
  justify-content: space-between;
  margin-top: 4px;
`;

const AbsorptionStat = styled.Text<{theme: ThemeType}>`
  font-size: 10px;
  color: ${({theme}) => theme.textColor};
  opacity: 0.6;
`;

// ── TIR breakdown mini-component ─────────────────────

const PostMealTirBar: React.FC<{tir: TimeInRangePercentages}> = ({tir}) => {
  const theme = useTheme() as ThemeType;

  const segments = [
    {pct: tir.veryLow, color: theme.severeBelowRange, label: 'VL'},
    {pct: tir.low, color: theme.belowRangeColor, label: 'Low'},
    {pct: tir.target, color: theme.inRangeColor, label: 'In'},
    {pct: tir.high, color: theme.aboveRangeColor, label: 'High'},
    {pct: tir.veryHigh, color: theme.severeAboveRange, label: 'VH'},
  ];

  return (
    <TirSection>
      <TirTitle>Post-meal TIR (3 hrs)</TirTitle>
      <TirBarContainer>
        {segments.map(
          (seg, idx) =>
            seg.pct > 0 && (
              <TirSegment key={idx} pct={seg.pct} bg={seg.color}>
                {seg.pct >= 10 && (
                  <TirSegmentLabel>{Math.round(seg.pct)}%</TirSegmentLabel>
                )}
              </TirSegment>
            ),
        )}
      </TirBarContainer>
      <TirLegendRow>
        <TirLegendItem>
          Low {Math.round(tir.veryLow + tir.low)}%
        </TirLegendItem>
        <TirLegendItem>
          In Range {Math.round(tir.target)}%
        </TirLegendItem>
        <TirLegendItem>
          High {Math.round(tir.high + tir.veryHigh)}%
        </TirLegendItem>
      </TirLegendRow>
    </TirSection>
  );
};

// ── Absorption breakdown mini-component ──────────────

/** Color the absorption bar: green ≥80%, yellow 50-79%, red <50%. */
function absorptionColor(pct: number, theme: ThemeType): string {
  if (pct >= 80) return theme.inRangeColor;
  if (pct >= 50) return theme.aboveRangeColor;
  return theme.belowRangeColor;
}

const PostMealAbsorptionBar: React.FC<{meal: MealEntry}> = ({meal}) => {
  const theme = useTheme() as ThemeType;

  if (meal.absorptionPct == null || meal.absorbed == null) return null;

  const barColor = absorptionColor(meal.absorptionPct, theme);

  return (
    <AbsorptionSection>
      <AbsorptionTitle>
        Carb Absorption (3 hrs) — {meal.absorptionPct}%
      </AbsorptionTitle>
      <AbsorptionBarBg>
        <AbsorptionBarFill pct={meal.absorptionPct} bg={barColor}>
          {meal.absorptionPct >= 15 && (
            <AbsorptionBarLabel>
              {meal.absorbed}g absorbed
            </AbsorptionBarLabel>
          )}
        </AbsorptionBarFill>
      </AbsorptionBarBg>
      <AbsorptionStatsRow>
        <AbsorptionStat>Entered: {meal.carbsEntered}g</AbsorptionStat>
        <AbsorptionStat>Absorbed: {meal.absorbed}g</AbsorptionStat>
        <AbsorptionStat>
          Remaining: {meal.cobRemaining ?? 0}g
        </AbsorptionStat>
      </AbsorptionStatsRow>
    </AbsorptionSection>
  );
};

// ── Main expander ────────────────────────────────────

interface MealChartExpanderProps {
  chartData: MealChartData;
  meal: MealEntry;
}

/**
 * Inline-expandable section showing:
 * 1) Post-meal TIR breakdown bar (3 hours)
 * 2) Full StackedHomeCharts (CGM + basal + insulin) scoped to the meal window
 */
const MealChartExpander: React.FC<MealChartExpanderProps> = ({
  chartData,
  meal,
}) => {
  const {width: screenWidth} = useWindowDimensions();
  const chartWidth = screenWidth - 8;

  const fallbackAnchorTimeMs = useMemo(() => {
    if (chartData.foodItems.length > 0) {
      return chartData.foodItems[0].timestamp;
    }
    return chartData.xDomain[0].getTime();
  }, [chartData]);

  return (
    <ChartExpanderContainer>
      {/* TIR breakdown bar */}
      {meal.postMealTir && <PostMealTirBar tir={meal.postMealTir} />}

      {/* Absorption breakdown bar */}
      <PostMealAbsorptionBar meal={meal} />

      {/* Full stacked charts */}
      {chartData.bgSamples.length > 0 && (
        <StackedHomeCharts
          bgSamples={chartData.bgSamples}
          foodItems={chartData.foodItems}
          insulinData={chartData.insulinData}
          basalProfileData={chartData.basalProfileData}
          width={chartWidth}
          cgmHeight={160}
          miniChartHeight={50}
          xDomain={chartData.xDomain}
          fallbackAnchorTimeMs={fallbackAnchorTimeMs}
          showFullScreenButton={false}
          tooltipPlacement="top"
        />
      )}
    </ChartExpanderContainer>
  );
};

export default React.memo(MealChartExpander);
