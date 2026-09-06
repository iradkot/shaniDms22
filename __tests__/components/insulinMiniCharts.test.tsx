import React from 'react';
import {Dimensions, Text, StyleSheet} from 'react-native';
import Svg, {Line, Rect, Path} from 'react-native-svg';
import renderer, {act} from 'react-test-renderer';
import {ThemeProvider} from 'styled-components/native';
import BasalMiniGraph from 'app/components/charts/BasalMiniGraph/BasalMiniGraph';
import ActiveInsulinMiniGraph from 'app/components/charts/ActiveInsulinMiniGraph/ActiveInsulinMiniGraph';
import CobMiniGraph from 'app/components/charts/CobMiniGraph/CobMiniGraph';
import BolusMiniGraph from 'app/components/charts/BolusMiniGraph/BolusMiniGraph';
import MixedMiniChart from 'app/components/charts/MixedMiniChart/MixedMiniChart';
import {getChartPalette} from 'app/components/charts/chartPalette';
import {
  buildMiniBasalSegments,
  buildMiniBolusPoints,
  buildMiniLoadSegments,
  niceMiniAxis,
} from 'app/components/charts/miniChartData';
import type {BgSample} from 'app/types/day_bgs.types';
import {theme} from 'app/style/theme';

const props = {
  width: 320,
  height: 140,
  bgSamples: [],
  xDomain: [new Date(0), new Date(3_600_000)] as [Date, Date],
  testID: 'lane',
};
const sample = (date: number, values: Partial<BgSample>): BgSample => ({
  date,
  sgv: 100,
  dateString: new Date(date).toISOString(),
  trend: 0,
  direction: 'Flat',
  device: 'test',
  type: 'sgv',
  ...values,
});
const stamp = (minutes: number) => new Date(minutes * 60_000).toISOString();
const render = (element: React.ReactNode) => {
  let tree: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <ThemeProvider theme={theme}>{element}</ThemeProvider>,
    );
  });
  return tree!;
};
const labels = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAllByType(Text).map(node => node.props.children);

describe('Mobile insulin lane presentation', () => {
  it.each([
    ['Basal', BasalMiniGraph, 'Basal · U/hr', 'No basal data'],
    [
      'IOB',
      ActiveInsulinMiniGraph,
      'Active insulin · U',
      'No active insulin data',
    ],
    ['COB', CobMiniGraph, 'Active carbs · g', 'No active carbs data'],
    ['Bolus', BolusMiniGraph, 'Bolus · U', 'No bolus records in this range'],
  ] as const)(
    'keeps %s labelled and compact when data is unavailable',
    (_name, Component, title, empty) => {
      let tree: renderer.ReactTestRenderer;
      act(() => {
        tree = renderer.create(
          <ThemeProvider theme={theme}>
            <Component {...props} />
          </ThemeProvider>,
        );
      });
      const renderedLabels = tree!.root
        .findAllByType(Text)
        .map(node => node.props.children);
      expect(renderedLabels).toContain(title);
      expect(renderedLabels).toContain(empty);
      expect(tree!.root.findAllByType(Svg)).toHaveLength(0);
      const lane = tree!.root
        .findAll(node => node.props.testID === 'lane')
        .find(node => typeof node.type !== 'function')!;
      expect(StyleSheet.flatten(lane.props.style).minHeight).toBeLessThan(
        100 * Math.max(1, Dimensions.get('window').fontScale),
      );
      act(() => tree!.unmount());
    },
  );

  it('distinguishes profile steps from delivered temporary basal and bolus doses by shape and units', () => {
    const tree = render(
      <>
        <BasalMiniGraph
          {...props}
          basalProfileData={[{time: '00:00', value: 0.8}]}
          insulinData={[
            {type: 'tempBasal', rate: 1.2, duration: 15, timestamp: stamp(10)},
          ]}
        />
        <BolusMiniGraph
          {...props}
          insulinData={[{type: 'bolus', amount: 2, timestamp: stamp(15)}]}
        />
      </>,
    );
    const scheduled = tree.root
      .findAllByType(Line)
      .filter(node => node.props.testID === 'basal-scheduled-segment');
    expect(scheduled.length).toBeGreaterThan(0);
    expect(scheduled.every(node => node.props.strokeDasharray === '5 4')).toBe(
      true,
    );
    const temporary = tree.root
      .findAllByType(Line)
      .find(node => node.props.testID === 'basal-tempBasal-segment')!;
    expect(temporary.props.strokeDasharray).toBeUndefined();
    const dose = tree.root
      .findAllByType(Rect)
      .find(node => node.props.testID === 'bolus-dose-bar')!;
    expect(dose.props.fill).toBe(getChartPalette(theme).bolus);
    expect(dose.props.fill).not.toBe(temporary.props.stroke);
    expect(labels(tree)).toEqual(
      expect.arrayContaining(['Basal · U/hr', 'Bolus · U', '2 U']),
    );
    act(() => tree.unmount());
  });

  it('uses the selected IOB reading, preserves its sign and does not replace a missing selection with the latest value', () => {
    const bgSamples = [sample(0, {iob: -0.4}), sample(5 * 60_000, {iob: 1.2})];
    const tree = render(
      <ActiveInsulinMiniGraph
        {...props}
        bgSamples={bgSamples}
        cursorTimeMs={0}
      />,
    );
    expect(labels(tree)).toContain('-0.4 U');
    expect(labels(tree)).not.toContain('1.2 U');
    act(() =>
      tree.update(
        <ThemeProvider theme={theme}>
          <ActiveInsulinMiniGraph
            {...props}
            bgSamples={bgSamples}
            cursorTimeMs={30 * 60_000}
          />
        </ThemeProvider>,
      ),
    );
    expect(labels(tree)).toContain('—');
    expect(labels(tree)).toContain('No reading at this time');
    act(() => tree.unmount());
  });

  it('does not draw an IOB line across a missing reading or a long gap', () => {
    const bgSamples = [
      sample(0, {iob: 1}),
      sample(5 * 60_000, {}),
      sample(10 * 60_000, {iob: 2}),
      sample(15 * 60_000, {iob: 0}),
      sample(40 * 60_000, {iob: -0.2}),
    ];
    const tree = render(
      <ActiveInsulinMiniGraph {...props} bgSamples={bgSamples} />,
    );
    const paths = tree.root
      .findAllByType(Path)
      .filter(node => node.props.testID === 'iob-line-segment');
    expect(paths).toHaveLength(1);
    expect(paths[0]!.props.d.match(/L/g)).toHaveLength(1);
    expect(buildMiniLoadSegments(bgSamples, props.xDomain, 'iob')).toEqual([
      [{x: 0, y: 1}],
      [
        {x: 10 * 60_000, y: 2},
        {x: 15 * 60_000, y: 0},
      ],
      [{x: 40 * 60_000, y: -0.2}],
    ]);
    act(() => tree.unmount());
  });

  it.each([
    ['IOB', ActiveInsulinMiniGraph, {iob: 1}, {iob: 2}],
    ['COB', CobMiniGraph, {cob: 10}, {cob: 20}],
  ] as const)(
    'keeps %s unknown at an explicitly missing reading instead of choosing a nearby value',
    (_name, Component, first, last) => {
      const bgSamples = [
        sample(0, first),
        sample(5 * 60_000, {}),
        sample(10 * 60_000, last),
      ];
      const tree = render(
        <Component
          {...props}
          bgSamples={bgSamples}
          cursorTimeMs={5 * 60_000}
        />,
      );
      expect(labels(tree)).toContain('—');
      expect(labels(tree)).toContain('No reading at this time');
      act(() =>
        tree.update(
          <ThemeProvider theme={theme}>
            <Component {...props} bgSamples={bgSamples.slice(0, 2)} />
          </ThemeProvider>,
        ),
      );
      expect(labels(tree)).toContain('—');
      expect(labels(tree)).toContain('No reading at this time');
      act(() => tree.unmount());
    },
  );

  it('overlays all three series on one time plot with separate labelled scales', () => {
    const tree = render(
      <MixedMiniChart
        {...props}
        basalProfileData={[{time: '00:00', value: 1}]}
        bgSamples={[sample(0, {iob: 2, cob: 30})]}
      />,
    );
    expect(tree.root.findAllByType(Svg)).toHaveLength(1);
    expect(labels(tree)).toEqual(
      expect.arrayContaining([
        '┏━ Basal · U/hr',
        '━ Active insulin · U',
        '┄┄ Active carbs · g',
        'Scale: 0 – 1',
        'Scale: 0 – 2',
        'Scale: 0 – 40',
        'Each series has its own scale. Compare timing, not line heights.',
      ]),
    );
    act(() => tree.unmount());
  });

  it('keeps real zeros, signed loads and unknown gaps in the overlay without glucose', () => {
    const tree = render(
      <MixedMiniChart
        {...props}
        cursorTimeMs={15 * 60_000}
        loadSamples={[
          {timestampMs: 0, iob: -0.4, cob: 0},
          {timestampMs: 5 * 60_000},
          {timestampMs: 10 * 60_000, iob: 0.2, cob: 0},
          {timestampMs: 15 * 60_000, iob: 0, cob: 0},
          {timestampMs: 40 * 60_000, iob: -0.2, cob: 0},
        ]}
      />,
    );
    expect(tree.root.findAllByType(Svg)).toHaveLength(1);
    for (const kind of ['iob', 'cob']) {
      const lines = tree.root
        .findAllByType(Path)
        .filter(node => node.props.testID === `${kind}-line-segment`);
      expect(lines).toHaveLength(1);
      expect(lines[0]!.props.d.match(/L/g)).toHaveLength(1);
      expect(
        tree.root.findAllByProps({testID: `${kind}-single-point`}).length,
      ).toBeGreaterThan(0);
    }
    expect(
      tree.root.findAllByProps({testID: 'mixed-time-cursor'}).length,
    ).toBeGreaterThan(0);
    expect(labels(tree)).toContain('Scale: -0.5 – 0.5');
    expect(labels(tree)).toContain('Scale: 0 – 1');
    act(() => tree.unmount());
  });

  it('uses independent selected load samples and keeps an explicit missing sample unknown', () => {
    const loads = [
      {timestampMs: 0, iob: 2, cob: 30},
      {timestampMs: 5 * 60_000},
      {timestampMs: 10 * 60_000, iob: 0, cob: 0},
    ];
    const tree = render(
      <ActiveInsulinMiniGraph
        {...props}
        loadSamples={loads}
        cursorTimeMs={5 * 60_000}
      />,
    );
    expect(labels(tree)).toContain('—');
    expect(labels(tree)).toContain('No reading at this time');
    act(() =>
      tree.update(
        <ThemeProvider theme={theme}>
          <ActiveInsulinMiniGraph
            {...props}
            loadSamples={loads}
            cursorTimeMs={10 * 60_000}
          />
        </ThemeProvider>,
      ),
    );
    expect(labels(tree)).toContain('0 U');
    act(() => tree.unmount());
  });

  it('shows Hebrew labels with explicit and different units', () => {
    const tree = render(
      <>
        <BasalMiniGraph {...props} locale="he" />
        <BolusMiniGraph {...props} locale="he" />
      </>,
    );
    expect(labels(tree)).toEqual(
      expect.arrayContaining(['בזאל · U/hr', 'בולוס · U']),
    );
    act(() => tree.unmount());
  });

  it('leaves unknown basal intervals absent and preserves a known zero suspension', () => {
    expect(buildMiniBasalSegments(undefined, undefined, props.xDomain)).toEqual(
      [],
    );
    expect(
      buildMiniBasalSegments(
        undefined,
        [{type: 'tempBasal', duration: 5, timestamp: stamp(0)}],
        props.xDomain,
      ),
    ).toEqual([]);
    expect(
      buildMiniBasalSegments(
        undefined,
        [{type: 'suspendPump', duration: 5, timestamp: stamp(10)}],
        props.xDomain,
      ),
    ).toEqual([
      {
        startMs: 10 * 60_000,
        endMs: 15 * 60_000,
        rate: 0,
        source: 'suspendPump',
      },
    ]);
  });

  it('retains each actual bolus independently and rejects invalid doses or other insulin types', () => {
    expect(
      buildMiniBolusPoints(
        [
          {type: 'bolus', amount: 1, timestamp: stamp(15)},
          {type: 'bolus', amount: 2, timestamp: stamp(15)},
          {type: 'tempBasal', rate: 3, timestamp: stamp(15)},
          {type: 'bolus', timestamp: stamp(15)},
          {type: 'bolus', amount: -1, timestamp: stamp(15)},
          {type: 'bolus', amount: 8, timestamp: stamp(90)},
        ],
        props.xDomain,
      ),
    ).toEqual([
      {x: 15 * 60_000, y: 1},
      {x: 15 * 60_000, y: 2},
    ]);
  });

  it('rounds mobile axis labels while keeping every signed value inside the scale', () => {
    expect(niceMiniAxis([0, 5.3])).toEqual({domain: [0, 6], ticks: [0, 3, 6]});
    expect(niceMiniAxis([0, 0.85])).toEqual({
      domain: [0, 1],
      ticks: [0, 0.5, 1],
    });
    const negative = niceMiniAxis([-0.4, 1.2]);
    expect(negative.domain[0]).toBeLessThanOrEqual(-0.4);
    expect(negative.domain[1]).toBeGreaterThanOrEqual(1.2);
    expect(negative.ticks).toContain(0);
  });

  it('keeps two simultaneous doses visible in one time column without overpainting either dose', () => {
    const tree = render(
      <BolusMiniGraph
        {...props}
        insulinData={[
          {type: 'bolus', amount: 1, timestamp: stamp(15)},
          {type: 'bolus', amount: 2, timestamp: stamp(15)},
        ]}
      />,
    );
    const bars = tree.root
      .findAllByType(Rect)
      .filter(node => node.props.testID === 'bolus-dose-bar');
    expect(bars).toHaveLength(2);
    expect(bars[0]!.props.x).toBe(bars[1]!.props.x);
    expect(bars[1]!.props.y + bars[1]!.props.height).toBeCloseTo(
      bars[0]!.props.y,
    );
    expect(labels(tree)).toEqual(
      expect.arrayContaining(['3 U', '2 doses in range']),
    );
    act(() => tree.unmount());
  });
});
