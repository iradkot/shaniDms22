import {cgmRange, CGM_STATUS_CODES} from 'app/constants/PLAN_CONFIG';
import {addOpacity} from 'app/style/styling.utils';
import type {ThemeType} from 'app/types/theme';
import {classifyTrendsRange, type TrendsRangeThresholds} from '../../modules/trends';

/** The selected reading and its plot marker must use the same range color. */
export const glucoseChartColor = (
  value: number,
  theme: ThemeType,
  thresholds: TrendsRangeThresholds = {
    veryLowMaxMgDl: cgmRange[CGM_STATUS_CODES.EXTREME_LOW] as number,
    targetMinMgDl: cgmRange.TARGET.min,
    targetMaxMgDl: cgmRange.TARGET.max,
    highMaxMgDl: cgmRange[CGM_STATUS_CODES.EXTREME_HIGH] as number,
  },
) => {
  const colors = {
    veryLowPercent: theme.severeBelowRange,
    lowPercent: theme.belowRangeColor,
    targetPercent: theme.inRangeColor,
    highPercent: theme.aboveRangeColor,
    veryHighPercent: theme.severeAboveRange,
  };
  return colors[classifyTrendsRange(value, thresholds)];
};

/** One semantic palette for the plot, lane titles, legends and inspector. */
export const getChartPalette = (theme: ThemeType) => ({
  ...theme.chart,
  text: theme.textColor,
  mutedText: addOpacity(theme.textColor, 0.7),
  grid: theme.borderColor,
  surface: theme.white,
  selection: theme.accentColor,
});

export type ChartPalette = ReturnType<typeof getChartPalette>;
