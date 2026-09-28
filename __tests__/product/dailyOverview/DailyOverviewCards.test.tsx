import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import {
  buildDailyOverview,
  type DailyInsulinComparisonPresentation,
} from 'app/modules/dailyOverview';
import {DailyOverviewCard} from 'app/product/dailyOverview/DailyOverviewCards';
import {InsulinSplitGraphic} from 'app/product/dailyOverview/DailyInsulinComparison';

const startMs = new Date(2026, 8, 27).getTime();
const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const base = buildDailyOverview({
  period: {startMs, endMs: new Date(2026, 8, 28).getTime()},
  expectedSampleIntervalMs: 5 * 60 * 1000,
  thresholds,
  source: {
    glucoseSamples: [{timestampMs: startMs, valueMgDl: 125}],
    insulinSummary: {
      quality: 'available',
      basalUnits: 18,
      bolusUnits: 8,
      basalEstimated: true,
    },
  },
});
const comparison: DailyInsulinComparisonPresentation = {
  status: 'available',
  yesterday: {basalUnits: 15, bolusUnits: 8, totalUnits: 23},
  weekAverage: {basalUnits: 20, bolusUnits: 9, totalUnits: 29},
  weekDays: 7,
  cutoffTimestampMs: startMs + 12 * 60 * 60 * 1000,
  isPartialDay: true,
};

const renderedText = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : Array.isArray(value)
    ? value.map(renderedText).join('')
    : '';
const textAt = (tree: renderer.ReactTestRenderer, testID: string): string =>
  renderedText(
    tree.root.findAllByProps({testID}).find(node => node.type === Text)?.props
      .children,
  );
const allText = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Text)
    .map(node => renderedText(node.props.children))
    .join('\n');
const mounted: renderer.ReactTestRenderer[] = [];
const mount = (element: React.ReactElement) => {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(element);
  });
  mounted.push(tree);
  return tree;
};
afterEach(() => mounted.splice(0).forEach(tree => act(() => tree.unmount())));

describe('Daily overview visual cards', () => {
  it.each(['ring', 'bar', 'list'] as const)(
    'keeps a glanceable TIR hero and exact accessible value in %s style',
    rangeStyle => {
      const overview = {
        ...base,
        ranges: {
          veryLowPercent: 2,
          lowPercent: 3,
          targetPercent: 82.35,
          highPercent: 10.65,
          veryHighPercent: 2,
        },
      };
      const tree = mount(
        <DailyOverviewCard
          id="ranges"
          overview={overview}
          locale="en"
          rangeStyle={rangeStyle}
          thresholds={thresholds}
        />,
      );
      expect(textAt(tree, 'daily-overview-tir-hero')).toBe('82%');
      expect(
        tree.root.findByProps({testID: 'daily-overview-tir-hero'}).props
          .accessibilityLabel,
      ).toBe('Time in range: 82.35%');
      expect(allText(tree)).toContain('Coverage is below 70%');
      if (rangeStyle !== 'list') {
        expect(allText(tree)).not.toContain('54–<70');
        act(() =>
          tree.root
            .findByProps({testID: 'daily-overview-range-details'})
            .props.onPress(),
        );
        expect(
          tree.root.findByProps({testID: 'daily-overview-range-details'}).props
            .accessibilityState,
        ).toEqual({expanded: true});
      }
      expect(allText(tree)).toContain('54–<70');
    },
  );

  it('switches comparison baseline without changing the current insulin total', () => {
    const tree = mount(
      <DailyOverviewCard
        id="insulin"
        overview={base}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
        insulinComparison={comparison}
      />,
    );
    expect(textAt(tree, 'daily-overview-insulin-total')).toBe('26 U');
    expect(textAt(tree, 'daily-overview-insulin-basal-percent')).toBe('69%');
    expect(textAt(tree, 'daily-overview-insulin-bolus-percent')).toBe('31%');
    expect(textAt(tree, 'daily-overview-insulin-delta')).toBe('+3 U');
    act(() =>
      tree.root
        .findByProps({testID: 'daily-overview-compare-week'})
        .props.onPress(),
    );
    expect(textAt(tree, 'daily-overview-insulin-delta')).toBe('−3 U');
    expect(textAt(tree, 'daily-overview-insulin-total')).toBe('26 U');
    expect(
      tree.root.findByProps({testID: 'daily-overview-compare-week'}).props
        .accessibilityState,
    ).toEqual({selected: true});
    expect(allText(tree)).toContain('Each day up to the same time · 12:00');
    expect(allText(tree)).toContain('Estimated');
    const scaled = tree.root
      .findAllByType(InsulinSplitGraphic)
      .filter(node => node.props.maximum !== undefined);
    expect(scaled.map(node => node.props.maximum)).toEqual([29, 29]);
  });

  it('identifies partial-day coverage and its captured cutoff', () => {
    const overview = {
      ...base,
      isPartialDay: true,
      observedPeriod: {startMs, endMs: comparison.cutoffTimestampMs},
    };
    const ranges = mount(
      <DailyOverviewCard
        id="ranges"
        overview={overview}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
      />,
    );
    const coverage = mount(
      <DailyOverviewCard
        id="coverage"
        overview={overview}
        locale="he"
        rangeStyle="ring"
        thresholds={thresholds}
      />,
    );
    expect(allText(ranges)).toContain('of today so far covered');
    expect(allText(ranges)).toContain('As of 12:00');
    expect(allText(coverage)).toContain('היום עד עכשיו · עד 12:00');
  });

  it('does not turn missing history into a zero or show the other baseline under the selected label', () => {
    const {weekAverage, ...onlyYesterday} = comparison;
    expect(weekAverage).toBeDefined();
    const tree = mount(
      <DailyOverviewCard
        id="insulin"
        overview={base}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
        insulinComparison={onlyYesterday}
      />,
    );
    act(() =>
      tree.root
        .findByProps({testID: 'daily-overview-compare-week'})
        .props.onPress(),
    );
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-insulin-delta'}),
    ).toHaveLength(0);
    expect(allText(tree)).toContain('Insulin history is unavailable');
    expect(textAt(tree, 'daily-overview-insulin-total')).toBe('26 U');
  });

  it('represents zero insulin with an empty split and undefined proportions', () => {
    const overview = {
      ...base,
      insulinSummary: {
        quality: 'available' as const,
        basalUnits: 0,
        bolusUnits: 0,
        totalUnits: 0,
      },
    };
    const tree = mount(
      <DailyOverviewCard
        id="insulin"
        overview={overview}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
      />,
    );
    expect(textAt(tree, 'daily-overview-insulin-total')).toBe('0 U');
    expect(textAt(tree, 'daily-overview-insulin-basal-percent')).toBe('—');
    expect(textAt(tree, 'daily-overview-insulin-bolus-percent')).toBe('—');
    expect(allText(tree)).not.toMatch(/NaN|Infinity/);
  });

  it('uses unrounded doses for tiny basal-only proportions and comparison scale', () => {
    const overview = {
      ...base,
      insulinSummary: {
        quality: 'available' as const,
        basalUnits: 0.005,
        bolusUnits: 0,
        totalUnits: 0.01,
      },
    };
    const history = {
      ...comparison,
      yesterday: {basalUnits: 0.009, bolusUnits: 0, totalUnits: 0.01},
    };
    const tree = mount(
      <DailyOverviewCard
        id="insulin"
        overview={overview}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
        insulinComparison={history}
      />,
    );
    expect(textAt(tree, 'daily-overview-insulin-total')).toBe('0.01 U');
    expect(textAt(tree, 'daily-overview-insulin-basal-percent')).toBe('100%');
    expect(textAt(tree, 'daily-overview-insulin-bolus-percent')).toBe('0%');
    const scaled = tree.root
      .findAllByType(InsulinSplitGraphic)
      .filter(node => node.props.maximum !== undefined);
    expect(scaled.map(node => node.props.maximum)).toEqual([0.009, 0.009]);
  });

  it('shows no change for equal raw doses even if stored totals round differently', () => {
    const overview = {
      ...base,
      insulinSummary: {
        quality: 'available' as const,
        basalUnits: 0.005,
        bolusUnits: 0,
        totalUnits: 0.01,
      },
    };
    const history = {
      ...comparison,
      yesterday: {basalUnits: 0.005, bolusUnits: 0, totalUnits: 0.005},
    };
    const tree = mount(
      <DailyOverviewCard
        id="insulin"
        overview={overview}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
        insulinComparison={history}
      />,
    );
    expect(textAt(tree, 'daily-overview-insulin-delta')).toBe('0 U');
  });

  it('keeps compact reorder previews noninteractive and localizes Hebrew comparisons', () => {
    const compact = mount(
      <DailyOverviewCard
        id="insulin"
        overview={base}
        locale="he"
        rangeStyle="ring"
        thresholds={thresholds}
        compact
        insulinComparison={comparison}
      />,
    );
    expect(
      compact.root.findAllByProps({testID: 'daily-overview-compare-week'}),
    ).toHaveLength(0);
    expect(compact.root.findAllByType(InsulinSplitGraphic)).toHaveLength(1);
    const full = mount(
      <DailyOverviewCard
        id="insulin"
        overview={base}
        locale="he"
        rangeStyle="ring"
        thresholds={thresholds}
        insulinComparison={comparison}
      />,
    );
    expect(allText(full)).toContain('ממוצע 7 ימים');
    expect(allText(full)).toContain('בכל יום עד אותה שעה');
  });
});
