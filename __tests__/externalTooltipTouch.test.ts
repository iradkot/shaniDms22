import {
  buildExternalTooltipPayloadFromLocationX,
  computeTouchTimeMsFromLocationX,
} from '../src/components/charts/CgmGraph/utils/externalTooltipTouch.utils';

const scale = {
  invert: (x: number) => new Date(x * 1000),
};

describe('external tooltip touch utilities', () => {
  it('maps local touch x to a tooltip payload', () => {
    expect(
      buildExternalTooltipPayloadFromLocationX({
        rawX: 75,
        plotMarginLeft: 25,
        plotWidth: 100,
        xScale: scale,
      }),
    ).toEqual({
      touchTimeMs: 50000,
      anchorTimeMs: 50000,
    });
  });

  it('clamps touches outside the plot instead of dropping the tooltip', () => {
    expect(
      computeTouchTimeMsFromLocationX({
        rawX: -100,
        plotMarginLeft: 25,
        plotWidth: 100,
        xScale: scale,
      }),
    ).toBe(0);

    expect(
      computeTouchTimeMsFromLocationX({
        rawX: 999,
        plotMarginLeft: 25,
        plotWidth: 100,
        xScale: scale,
      }),
    ).toBe(100000);
  });

  it('returns null for invalid touch input', () => {
    expect(
      buildExternalTooltipPayloadFromLocationX({
        rawX: Number.NaN,
        plotMarginLeft: 25,
        plotWidth: 100,
        xScale: scale,
      }),
    ).toBeNull();
  });
});
