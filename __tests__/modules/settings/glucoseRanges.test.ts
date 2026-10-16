import {
  DEFAULT_GLUCOSE_RANGE_THRESHOLDS,
  isValidGlucoseRangeThresholds,
} from 'app/modules/settings';

describe('personal glucose range validation', () => {
  it('accepts defaults and ordered integer boundaries including sensor limits', () => {
    expect(
      isValidGlucoseRangeThresholds(DEFAULT_GLUCOSE_RANGE_THRESHOLDS),
    ).toBe(true);
    expect(
      isValidGlucoseRangeThresholds({
        veryLowMaxMgDl: 20,
        targetMinMgDl: 80,
        targetMaxMgDl: 160,
        highMaxMgDl: 600,
      }),
    ).toBe(true);
  });

  it.each([
    null,
    {},
    {...DEFAULT_GLUCOSE_RANGE_THRESHOLDS, veryLowMaxMgDl: 0},
    {...DEFAULT_GLUCOSE_RANGE_THRESHOLDS, veryLowMaxMgDl: 19},
    {...DEFAULT_GLUCOSE_RANGE_THRESHOLDS, targetMinMgDl: 54},
    {...DEFAULT_GLUCOSE_RANGE_THRESHOLDS, targetMinMgDl: 181},
    {...DEFAULT_GLUCOSE_RANGE_THRESHOLDS, targetMinMgDl: 70.5},
    {...DEFAULT_GLUCOSE_RANGE_THRESHOLDS, targetMinMgDl: '70'},
    {...DEFAULT_GLUCOSE_RANGE_THRESHOLDS, targetMinMgDl: NaN},
    {...DEFAULT_GLUCOSE_RANGE_THRESHOLDS, highMaxMgDl: Infinity},
    {...DEFAULT_GLUCOSE_RANGE_THRESHOLDS, highMaxMgDl: 601},
  ])(
    'rejects incomplete, nonnumeric, unordered, or out-of-range values: %p',
    value => {
      expect(isValidGlucoseRangeThresholds(value)).toBe(false);
    },
  );
});
