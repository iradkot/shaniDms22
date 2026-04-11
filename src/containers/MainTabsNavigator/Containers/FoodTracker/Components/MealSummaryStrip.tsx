import React, {useMemo} from 'react';
import {useTheme} from 'styled-components/native';

import {MealEntry} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/types';
import {
  SummaryRow,
  SummaryItem,
  SummaryValue,
  SummaryLabel,
} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/styles';
import {ThemeType} from 'app/types/theme';

interface MealSummaryStripProps {
  meals: MealEntry[];
}

const MealSummaryStrip: React.FC<MealSummaryStripProps> = ({meals}) => {
  const theme = useTheme() as ThemeType;

  const stats = useMemo(() => {
    if (!meals.length) return null;

    const totalCarbs = meals.reduce((s, m) => s + m.carbsEntered, 0);
    const avgCarbs = Math.round(totalCarbs / meals.length);

    const mealsWithScore = meals.filter(m => m.score != null);
    const avgScore = mealsWithScore.length
      ? Math.round(
          mealsWithScore.reduce((s, m) => s + (m.score ?? 0), 0) /
            mealsWithScore.length,
        )
      : null;

    const mealsWithAbs = meals.filter(m => m.absorptionPct != null);
    const avgAbs = mealsWithAbs.length
      ? Math.round(
          mealsWithAbs.reduce((s, m) => s + (m.absorptionPct ?? 0), 0) /
            mealsWithAbs.length,
        )
      : null;

    return {
      count: meals.length,
      totalCarbs,
      avgCarbs,
      avgScore,
      avgAbs,
    };
  }, [meals]);

  if (!stats) return null;

  return (
    <SummaryRow>
      <SummaryItem>
        <SummaryValue>{stats.count}</SummaryValue>
        <SummaryLabel>Meals</SummaryLabel>
      </SummaryItem>
      <SummaryItem>
        <SummaryValue>{stats.totalCarbs}g</SummaryValue>
        <SummaryLabel>Total Carbs</SummaryLabel>
      </SummaryItem>
      <SummaryItem>
        <SummaryValue>{stats.avgCarbs}g</SummaryValue>
        <SummaryLabel>Avg/Meal</SummaryLabel>
      </SummaryItem>
      {stats.avgAbs != null && (
        <SummaryItem>
          <SummaryValue
            style={{
              color:
                stats.avgAbs >= 80
                  ? theme.inRangeColor
                  : stats.avgAbs >= 50
                    ? theme.aboveRangeColor
                    : theme.belowRangeColor,
            }}>
            {stats.avgAbs}%
          </SummaryValue>
          <SummaryLabel>Avg Abs</SummaryLabel>
        </SummaryItem>
      )}
      {stats.avgScore != null && (
        <SummaryItem>
          <SummaryValue
            style={{
              color:
                stats.avgScore >= 70
                  ? theme.inRangeColor
                  : stats.avgScore >= 50
                    ? theme.aboveRangeColor
                    : theme.belowRangeColor,
            }}>
            {stats.avgScore}%
          </SummaryValue>
          <SummaryLabel>Avg Score</SummaryLabel>
        </SummaryItem>
      )}
    </SummaryRow>
  );
};

export default React.memo(MealSummaryStrip);
