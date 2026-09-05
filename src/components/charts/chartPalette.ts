import {cgmRange} from 'app/constants/PLAN_CONFIG';
import {addOpacity} from 'app/style/styling.utils';
import type {ThemeType} from 'app/types/theme';

/** The selected reading and its plot marker must use the same range color. */
export const glucoseChartColor = (value: number, theme: ThemeType) =>
  value < cgmRange.TARGET.min
    ? theme.belowRangeColor
    : value > cgmRange.TARGET.max
    ? theme.aboveRangeColor
    : theme.inRangeColor;

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
