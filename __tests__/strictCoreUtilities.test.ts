import {
  extractLoad,
  mergeDeviceStatusIntoBgSamples,
} from 'app/utils/mergeDeviceStatusIntoBgSamples.utils';
import {buildFullScreenStackedChartsParams} from 'app/utils/stackedChartsData.utils';

describe('strict core utility contracts', () => {
  it('omits unavailable load fields instead of publishing undefined values', () => {
    const load = extractLoad({iob: 2.4} as never);

    expect(load).toEqual({iob: 2.4});
    expect(load).not.toHaveProperty('cob');
    expect(load).not.toHaveProperty('iobBolus');
    expect(load).not.toHaveProperty('iobBasal');
  });

  it('keeps an unmatched glucose sample unchanged', () => {
    const sample = {
      sgv: 120,
      date: 1_700_000_000_000,
      dateString: '2023-11-14T22:13:20.000Z',
      trend: 4,
      direction: 'Flat',
      device: 'test',
      type: 'sgv',
    } as const;

    const result = mergeDeviceStatusIntoBgSamples({
      bgSamples: [sample as never],
      deviceStatus: [{mills: sample.date - 11 * 60_000, iob: 1} as never],
    });

    expect(result).toEqual([sample]);
  });

  it('omits absent optional fullscreen parameters', () => {
    const params = buildFullScreenStackedChartsParams({
      bgSamples: [],
      foodItems: null,
    });

    expect(params).toEqual({
      mode: 'stackedCharts',
      bgSamples: [],
      foodItems: null,
    });
    expect(params).not.toHaveProperty('title');
  });
});
