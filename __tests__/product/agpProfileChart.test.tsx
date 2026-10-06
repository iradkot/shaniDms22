import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {StyleSheet, Text} from 'react-native';
import Svg, {Circle, Path} from 'react-native-svg';
import {buildAgpProfile} from 'app/modules/trends';
import {AgpProfileChart} from 'app/product/trends/AgpProfileChart';
import {buildAgpChartGeometry} from 'app/product/trends/agpChartGeometry';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const thresholds = {targetMinMgDl: 70, targetMaxMgDl: 180};
const profileFor = (
  hours: ReadonlyArray<{hour: number; values: readonly number[]}>,
) =>
  buildAgpProfile({
    period: {startMs: 0, endMs: 14 * DAY_MS},
    expectedSampleIntervalMs: 5 * 60 * 1000,
    timeZoneOffsetMinutes: 0,
    samples: hours.flatMap(({hour, values}) =>
      values.map((valueMgDl, day) => ({
        timestampMs: day * DAY_MS + hour * HOUR_MS,
        valueMgDl,
      })),
    ),
  });

const textOf = (value: unknown): string =>
  Array.isArray(value)
    ? value.map(textOf).join('')
    : typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';

describe('AGP chart geometry', () => {
  it('places the domain percentiles exactly and closes each band with the correct lower edge', () => {
    const profile = profileFor([
      {hour: 1, values: [40, 80, 120, 160, 200]},
      {hour: 2, values: [50, 90, 130, 170, 210]},
    ]);
    const geometry = buildAgpChartGeometry(profile, thresholds, 320);
    const first = geometry.segments[0]!.points[0]!;
    expect(profile.buckets[1]).toMatchObject({
      p10MgDl: 56,
      p25MgDl: 80,
      medianMgDl: 120,
      p75MgDl: 160,
      p90MgDl: 184,
    });
    expect(first).toMatchObject({
      hour: 1,
      x: geometry.xAtHour(1.5),
      p10Y: geometry.yAtMgDl(56),
      p25Y: geometry.yAtMgDl(80),
      medianY: geometry.yAtMgDl(120),
      p75Y: geometry.yAtMgDl(160),
      p90Y: geometry.yAtMgDl(184),
    });
    const coordinatesOf = (path: string) =>
      path.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
    const [firstPoint, secondPoint] = geometry.segments[0]!.points;
    const closeTo = (value: number) => expect.closeTo(value, 3);
    expect(coordinatesOf(geometry.segments[0]!.outerPath!)).toEqual([
      closeTo(firstPoint!.x),
      closeTo(firstPoint!.p90Y),
      closeTo(secondPoint!.x),
      closeTo(secondPoint!.p90Y),
      closeTo(secondPoint!.x),
      closeTo(secondPoint!.p10Y),
      closeTo(firstPoint!.x),
      closeTo(firstPoint!.p10Y),
    ]);
    expect(coordinatesOf(geometry.segments[0]!.innerPath!)).toEqual([
      closeTo(firstPoint!.x),
      closeTo(firstPoint!.p75Y),
      closeTo(secondPoint!.x),
      closeTo(secondPoint!.p75Y),
      closeTo(secondPoint!.x),
      closeTo(secondPoint!.p25Y),
      closeTo(firstPoint!.x),
      closeTo(firstPoint!.p25Y),
    ]);
    expect(geometry.xAtHour(0)).toBe(geometry.plot.left);
    expect(geometry.xAtHour(24)).toBe(geometry.plot.right);
  });

  it('splits at missing clock hours and never joins hour23 back to hour0', () => {
    const profile = profileFor(
      [0, 1, 4, 6, 7, 23].map(hour => ({hour, values: [100, 120, 140]})),
    );
    const geometry = buildAgpChartGeometry(profile, thresholds, 320);
    expect(
      geometry.segments.map(segment => segment.points.map(point => point.hour)),
    ).toEqual([[0, 1], [4], [6, 7], [23]]);
    expect(geometry.segments[0]!.medianPath).toMatch(/^M.* L/);
    expect(geometry.segments[1]).toMatchObject({
      outerPath: undefined,
      innerPath: undefined,
      medianPath: undefined,
    });
    expect(geometry.segments[3]).toMatchObject({
      outerPath: undefined,
      innerPath: undefined,
      medianPath: undefined,
    });
  });

  it('includes extreme source readings and custom thresholds without clipping or flattening the percentile band', () => {
    const profile = profileFor([{hour: 12, values: [20, 40, 120, 160, 650]}]);
    const custom = {targetMinMgDl: 45, targetMaxMgDl: 720};
    const geometry = buildAgpChartGeometry(profile, custom, 390);
    expect(geometry.minMgDl).toBeLessThanOrEqual(20);
    expect(geometry.maxMgDl).toBeGreaterThan(720);
    for (const value of [20, 40, 120, 160, 650, 45, 720]) {
      expect(geometry.yAtMgDl(value)).toBeGreaterThanOrEqual(geometry.plot.top);
      expect(geometry.yAtMgDl(value)).toBeLessThanOrEqual(geometry.plot.bottom);
    }
    const bucket = profile.buckets[12]!;
    const point = geometry.segments[0]!.points[0]!;
    expect(point.p90Y).toBe(geometry.yAtMgDl(bucket.p90MgDl!));
    expect(point.p90Y).toBeGreaterThan(geometry.yAtMgDl(650));
  });

  it.each([0, 20, 250, 320, 1024, Number.NaN])(
    'keeps a nonnegative finite plot at width%s',
    width => {
      const geometry = buildAgpChartGeometry(
        profileFor([{hour: 1, values: [100, 150]}]),
        thresholds,
        width,
      );
      expect(geometry.plot.width).toBeGreaterThanOrEqual(0);
      expect(geometry.plot.height).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(geometry.plot.width)).toBe(true);
      expect(Number.isFinite(geometry.segments[0]!.points[0]!.medianY)).toBe(
        true,
      );
      expect(geometry.xAtHour(24)).toBe(geometry.plot.right);
    },
  );
});

describe('AgpProfileChart', () => {
  it('renders genuine percentile paths and follows the available mobile width', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AgpProfileChart
          profile={profileFor([
            {hour: 1, values: [100, 120, 140]},
            {hour: 2, values: [110, 130, 150]},
          ])}
          locale="en"
          thresholds={thresholds}
        />,
      );
    });
    expect(tree!.root.findAllByType(Path)).toHaveLength(3);
    expect(
      tree!.root.findAllByType(Path).every(path => /M.*L/.test(path.props.d)),
    ).toBe(true);
    expect(tree!.root.findByType(Svg).props.width).toBe(320);
    act(() =>
      tree!.root
        .findByProps({testID: 'agp-profile-chart-plot'})
        .props.onLayout({nativeEvent: {layout: {width: 280}}}),
    );
    expect(tree!.root.findByType(Svg).props.width).toBe(280);
    expect(
      tree!.root.findByProps({testID: 'agp-profile-chart-plot'}).props
        .accessibilityLabel,
    ).toContain('Missing hours remain gaps');
    act(() => tree!.unmount());
  });

  it('marks an isolated hour rather than drawing a continuous path', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AgpProfileChart
          profile={profileFor([{hour: 23, values: [80, 120, 160]}])}
          locale="en"
          thresholds={thresholds}
        />,
      );
    });
    expect(tree!.root.findAllByType(Path)).toHaveLength(0);
    expect(tree!.root.findAllByType(Circle)).toHaveLength(1);
    expect(tree!.root.findByProps({testID: 'agp-single-hour-23'})).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('shows an explicit empty state with no chart paths', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AgpProfileChart
          profile={profileFor([])}
          locale="en"
          thresholds={thresholds}
        />,
      );
    });
    expect(tree!.root.findByProps({testID: 'agp-profile-chart'})).toBeTruthy();
    expect(
      tree!.root.findByProps({testID: 'agp-profile-chart-empty'}).props
        .children,
    ).toBe('No readings to plot for this period.');
    expect(tree!.root.findAllByType(Svg)).toHaveLength(0);
    expect(tree!.root.findAllByType(Path)).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('localizes percentile meaning and gaps in Hebrew while keeping the clock axis left to right', () => {
    let tree: renderer.ReactTestRenderer;
    act(() => {
      tree = renderer.create(
        <AgpProfileChart
          profile={profileFor([{hour: 1, values: [100, 120, 140]}])}
          locale="he"
          thresholds={thresholds}
        />,
      );
    });
    const text = tree!.root
      .findAllByType(Text)
      .map(node => textOf(node.props.children))
      .join(' ');
    expect(text).toContain('10–90%');
    expect(text).toContain('25–75%');
    expect(text).toContain(
      'הקריאות מכל הימים שנבחרו מקובצות לפי שעת השעון המקומית',
    );
    expect(text).toContain('שעות ללא קריאות נשארות כפערים');
    const plot = tree!.root.findByProps({testID: 'agp-profile-chart-plot'});
    expect(plot.props.accessibilityLabel).toContain('חציון');
    expect(plot.props.style.direction).toBe('ltr');
    // Both the stand-alone legends and inline RTL prose must retain low→high.
    for (const [key, range] of [
      ['outer', '10–90%'],
      ['inner', '25–75%'],
    ]) {
      const legend = tree!.root.findByProps({testID: `agp-legend-${key}`});
      expect(legend.props.children).toBe(`\u2066${range}\u2069`);
      expect(StyleSheet.flatten(legend.props.style).writingDirection).toBe(
        'ltr',
      );
    }
    const target = tree!.root.findByProps({testID: 'agp-legend-target'});
    expect(target.props.children).toBe('טווח יעד \u206670–180\u2069');
    const caption = tree!.root.findByProps({
      testID: 'agp-profile-chart-caption',
    });
    expect(caption.props.children).toContain('\u206610–90%\u2069');
    expect(caption.props.children).toContain('\u206625–75%\u2069');
    expect(StyleSheet.flatten(caption.props.style).writingDirection).toBe(
      'rtl',
    );
    act(() =>
      tree!.update(
        <AgpProfileChart
          profile={profileFor([{hour: 1, values: [100, 120, 140]}])}
          locale="he"
          thresholds={{targetMinMgDl: 70.5, targetMaxMgDl: 180.5}}
        />,
      ),
    );
    expect(
      tree!.root.findByProps({testID: 'agp-legend-target'}).props.children,
    ).toBe('טווח יעד \u206670.5–180.5\u2069');
    act(() => tree!.unmount());
  });
});
