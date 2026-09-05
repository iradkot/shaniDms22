import React from 'react';
import renderer, {act} from 'react-test-renderer';
import type {BgSample} from 'app/types/day_bgs.types';
import {buildDayGraph} from 'app/modules/dayGraph';
import {buildDayGraphChartPresentation} from 'app/product/dayGraph/DayGraphChartAdapter';
import {buildChartLoadSeries} from 'app/utils/chartLoadSeries.utils';
import {useBgTooltipDerivedMetrics} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts/hooks/useBgTooltipDerivedMetrics';

type IobFields = Pick<BgSample, 'iob' | 'iobBolus' | 'iobBasal'>;
const reading = (values: IobFields): BgSample => ({
  date: 300_000,
  dateString: new Date(300_000).toISOString(),
  sgv: 100,
  trend: 0,
  direction: 'Flat',
  type: 'sgv',
  device: 'fixture',
  ...values,
});

describe('IOB total consistency across graph, inspector and availability', () => {
  it.each<[string, IobFields, number | null]>([
    ['bolus-only reading', {iobBolus: 2}, null],
    ['basal-only reading', {iobBasal: -0.4}, null],
    ['invalid components', {iobBolus: NaN, iobBasal: Infinity}, null],
    ['complete split reading', {iobBolus: 2, iobBasal: -0.4}, 1.6],
    ['explicit total with partial split', {iob: 3.4, iobBolus: 2}, 3.4],
    ['explicit zero', {iob: 0, iobBolus: 2}, 0],
  ])('handles %s consistently', (_name, fields, expected) => {
    const sample = reading(fields);
    let metrics: ReturnType<typeof useBgTooltipDerivedMetrics> | undefined;
    const Harness = () => {
      metrics = useBgTooltipDerivedMetrics(sample);
      return null;
    };
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(metrics!.activeInsulinU).toBe(expected);
    const {iobPoints} = buildChartLoadSeries(
      [sample],
      [new Date(0), new Date(600_000)],
    );
    expect(iobPoints).toEqual(
      expected == null ? [] : [{x: sample.date, y: expected}],
    );

    const model = buildDayGraph({
      period: {dayStartMs: 0, dayEndMs: 3_600_000},
      expectedSampleIntervalMs: 300_000,
      glucoseSamples: [
        {
          identity: {sourceId: 'fixture', recordId: 'glucose'},
          timestampMs: sample.date,
          valueMgDl: sample.sgv,
          ...(fields.iob === undefined ? {} : {iobUnits: fields.iob}),
          ...(fields.iobBolus === undefined
            ? {}
            : {bolusIobUnits: fields.iobBolus}),
          ...(fields.iobBasal === undefined
            ? {}
            : {basalIobUnits: fields.iobBasal}),
        },
      ],
      timelineItems: [],
    });
    expect(
      buildDayGraphChartPresentation(model).availability.activeInsulin,
    ).toBe(expected != null);
    act(() => tree!.unmount());
  });
});
