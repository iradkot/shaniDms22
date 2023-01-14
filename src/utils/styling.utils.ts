import {interpolateRgb} from 'd3';

const SEVERE_HYPO_THRESHOLD = 55; // dark red
const HYPO_THRESHOLD = 70; // bright orange-red
const TARGET_FROM = 90; // green
const TARGET_TO = 110; // green
const TARGET_MIDDLE = (TARGET_TO + TARGET_FROM) / 2;
const HYPER_THRESHOLD = 180; // yellowish green
const SEVERE_HYPER_THRESHOLD = 250; // red

// colors for bg thresholds
const SEVERE_HYPO_COLOR = 'rgb(255,0,0)';
const HYPO_COLOR = 'rgba(255,10,0,0.71)';
const TARGET_FROM_COLOR = 'rgb(255,209,94)';
const TARGET_MIDDLE_COLOR = 'rgba(0, 255, 0, 1)';
const TARGET_TO_COLOR = 'rgb(106,255,2)';
const HYPER_COLOR = 'rgb(247,255,27)';
const SEVERE_HYPER_COLOR = 'rgb(255,0,0)';

export const getBackgroundColor = (bgValue: number) => {
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
