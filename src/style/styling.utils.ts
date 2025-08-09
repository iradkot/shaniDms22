import {interpolateRgb} from 'd3';
import {DetermineBgColorByGlucoseValue, ThemeType} from 'app/types/theme';
import {Platform} from 'react-native';
import { GLUCOSE_THRESHOLDS } from 'app/constants/PLAN_CONFIG';

// Import glucose thresholds from the single source of truth
export const SEVERE_HYPO_THRESHOLD = GLUCOSE_THRESHOLDS.SEVERE_HYPO;
export const HYPO_THRESHOLD = GLUCOSE_THRESHOLDS.HYPO;
export const TARGET_FROM = GLUCOSE_THRESHOLDS.TARGET_RANGE.TIGHT.min;
export const TARGET_TO = GLUCOSE_THRESHOLDS.TARGET_RANGE.TIGHT.max;
export const TARGET_MIDDLE = GLUCOSE_THRESHOLDS.TARGET_RANGE.TIGHT.middle;
export const HYPER_THRESHOLD = GLUCOSE_THRESHOLDS.HYPER;
export const SEVERE_HYPER_THRESHOLD = GLUCOSE_THRESHOLDS.SEVERE_HYPER;

// props are bgValue and theme, theme defaults to theme
export const determineBgColorByGlucoseValue: DetermineBgColorByGlucoseValue = (
  bgValue: number,
  currentTheme: ThemeType,
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

const hexToRgba = (hex: string, opacity: number): string => {
  const hexValue = hex.replace('#', '');
  const r = parseInt(hexValue.substring(0, 2), 16);
  const g = parseInt(hexValue.substring(2, 4), 16);
  const b = parseInt(hexValue.substring(4, 6), 16);

  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

export const addOpacity = (color: string, opacity: number): string => {
  // If color is in HEX format
  if (color.startsWith('#')) {
    return hexToRgba(color, opacity);
  }

  // If color is in RGB or RGBA format
  const rgbaRegex =
    /^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i;
  const matches = color.match(rgbaRegex);

  if (matches) {
    const r = parseInt(matches[1], 10);
    const g = parseInt(matches[2], 10);
    const b = parseInt(matches[3], 10);
    const existingOpacity = matches[4] ? parseFloat(matches[4]) : 1;

    return `rgba(${r}, ${g}, ${b}, ${opacity * existingOpacity})`;
  }

  // If color format is not supported, return the original color
  console.log(`Color format not supported: ${color}`);
  return color;
};

export const shadowStyles = ({
  theme,
  color,
  elevation,
}: {
  theme: ThemeType;
  color?: string;
  elevation?: number;
}) => {
  const shadowTL = Platform.select({
    ios: `shadowColor: ${
      color || theme.shadowColor
    }; shadowOffset: {width: 0, height: 2}; shadowOpacity: 0.8; shadowRadius: ${
      theme.borderRadius
    }px;`,
    android: `elevation: ${elevation};`,
  });

  return shadowTL || '';
};

export const addBrightness = (color: string, amount: number): string => {
  const rgbaRegex =
    /^rgba?\(\s*([0-9]+)\s*,\s*([0-9]+)\s*,\s*([0-9]+)\s*(?:,\s*([0-9.]+)\s*)?\)$/i;
  const matches = color.match(rgbaRegex);

  if (matches) {
    const r = parseInt(matches[1], 10);
    const g = parseInt(matches[2], 10);
    const b = parseInt(matches[3], 10);

    return `rgb(${r + amount}, ${g + amount}, ${b + amount})`;
  }

  return color;
};
