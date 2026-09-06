import {
  extractLoad,
  getDeviceStatusTimestampMs,
  mergeDeviceStatusIntoBgSamples,
} from 'app/utils/mergeDeviceStatusIntoBgSamples.utils';
import type {BgSample} from 'app/types/day_bgs.types';
import type {DeviceStatusEntry} from 'app/types/deviceStatus.types';

const time = Date.parse('2026-09-06T09:00:00Z');

describe('Shared Nightscout active load normalization', () => {
  it('clears an old glucose load value when the nearest report explicitly marks it missing', () => {
    const sample: BgSample = {
      date: time,
      dateString: new Date(time).toISOString(),
      sgv: 100,
      direction: 'Flat',
      device: 'test',
      type: 'sgv',
      trend: 0,
      iob: 2,
      iobBolus: 2,
      iobBasal: 0,
      cob: 20,
    };
    const result = mergeDeviceStatusIntoBgSamples({
      bgSamples: [sample],
      deviceStatus: [
        {mills: time - 5 * 60_000, iob: 2, cob: 20},
        {mills: time, iob: null, cob: null} as unknown as DeviceStatusEntry,
        {mills: time + 5 * 60_000, iob: 1, cob: 10},
      ],
    });
    expect(result[0]?.iob).toBeUndefined();
    expect(result[0]?.iobBolus).toBeUndefined();
    expect(result[0]?.iobBasal).toBeUndefined();
    expect(result[0]?.cob).toBeUndefined();
    expect(result[0]?.sgv).toBe(100);
  });
  it('does not convert a lone known bolus component into a total with an invented zero basal component', () => {
    expect(extractLoad({loop: {iob: {bolusIob: 1.5}}})).toEqual({
      iobBolus: 1.5,
    });
  });

  it('preserves an available signed component beside an explicit total', () => {
    expect(extractLoad({loop: {iob: {iob: 1.2, basalIob: -0.3}}})).toEqual({
      iob: 1.2,
      iobBasal: -0.3,
    });
  });

  it('preserves a known zero when complete signed components cancel', () => {
    expect(extractLoad({loop: {iob: {bolusIob: 0.5, basalIob: -0.5}}})).toEqual(
      {iob: 0, iobBolus: 0.5, iobBasal: -0.5},
    );
  });

  it('keeps the reported Loop values and their computation timestamp', () => {
    const entry = {
      created_at: new Date(time + 60_000).toISOString(),
      loop: {
        iob: {iob: -0.2, timestamp: new Date(time).toISOString()},
        cob: {cob: 0},
      },
    };
    expect(extractLoad(entry)).toEqual({iob: -0.2, cob: 0});
    expect(getDeviceStatusTimestampMs(entry)).toBe(time);
  });

  it('uses a nearby actual load report when the closest device status contains only uploader information', () => {
    const sample: BgSample = {
      date: time,
      sgv: 100,
      dateString: new Date(time).toISOString(),
      direction: 'Flat',
      device: 'test',
      type: 'sgv',
      trend: 0,
    };
    const result = mergeDeviceStatusIntoBgSamples({
      bgSamples: [sample],
      deviceStatus: [
        {mills: time, uploader: {battery: 80}},
        {
          created_at: new Date(time - 60_000).toISOString(),
          loop: {iob: {iob: 1.2}, cob: {cob: 20}},
        },
      ],
    });
    expect(result[0]).toEqual({...sample, iob: 1.2, cob: 20});
  });
});
