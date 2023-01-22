import {interpolateRgb} from 'd3';
import {Theme, DetermineBgColorByGlucoseValue} from 'app/types/theme';
import {theme} from 'app/style/theme';
//
const SEVERE_HYPO_THRESHOLD = 55;
const HYPO_THRESHOLD = 70;
const TARGET_FROM = 90;
const TARGET_TO = 110;
const TARGET_MIDDLE = (TARGET_TO + TARGET_FROM) / 2;
const HYPER_THRESHOLD = 180;
const SEVERE_HYPER_THRESHOLD = 250;

// props are bgValue and theme, theme defaults to theme
export const determineBgColorByGlucoseValue: DetermineBgColorByGlucoseValue = (
  bgValue: number,
  currentTheme: Theme,
) => {
  const SEVERE_HYPO_COLOR = currentTheme.severeBelowRange;
  const HYPO_COLOR = currentTheme.belowRangeColor;
  const TARGET_FROM_COLOR = currentTheme.inRangeColor;
  const TARGET_MIDDLE_COLOR = currentTheme.inRangeColor;
  const TARGET_TO_COLOR = currentTheme.inRangeColor;
  const HYPER_COLOR = currentTheme.aboveRangeColor;
  const SEVERE_HYPER_COLOR = currentTheme.severeAboveRange;

  if (bgValue > SEVERE_HYPER_THRESHOLD) {
    return SEVERE_HYPER_COLOR;
  } else if (bgValue > HYPER_THRESHOLD) {
    const fraction =
      (bgValue - HYPER_THRESHOLD) / (SEVERE_HYPER_THRESHOLD - HYPER_THRESHOLD);
    return interpolateRgb(HYPER_COLOR, SEVERE_HYPER_COLOR)(fraction);
  } else if (bgValue > TARGET_TO) {
    const fraction = (bgValue - TARGET_TO) / (HYPER_THRESHOLD - TARGET_TO);
    return interpolateRgb(TARGET_TO_COLOR, HYPER_COLOR)(fraction);
  } else if (bgValue > TARGET_MIDDLE) {
    const fraction = (bgValue - TARGET_MIDDLE) / (TARGET_TO - TARGET_MIDDLE);
    return interpolateRgb(TARGET_MIDDLE_COLOR, TARGET_TO_COLOR)(fraction);
  } else if (bgValue > TARGET_FROM) {
    const fraction = (bgValue - TARGET_FROM) / (TARGET_MIDDLE - TARGET_FROM);
    return interpolateRgb(TARGET_FROM_COLOR, TARGET_MIDDLE_COLOR)(fraction);
  } else if (bgValue > HYPO_THRESHOLD) {
    const fraction =
      (bgValue - HYPO_THRESHOLD) / (TARGET_FROM - HYPO_THRESHOLD);
    return interpolateRgb(HYPO_COLOR, TARGET_FROM_COLOR)(fraction);
  } else if (bgValue > SEVERE_HYPO_THRESHOLD) {
    const fraction =
      (bgValue - SEVERE_HYPO_THRESHOLD) /
      (HYPO_THRESHOLD - SEVERE_HYPO_THRESHOLD);
    return interpolateRgb(SEVERE_HYPO_COLOR, HYPO_COLOR)(fraction);
  } else {
    return SEVERE_HYPO_COLOR;
  }
};
