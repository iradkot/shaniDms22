import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {StyleSheet, Text} from 'react-native';
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
      basalEvidence: 'recorded',
    },
  },
});
const comparison: DailyInsulinComparisonPresentation = {
  status: 'available',
  yesterday: {
    quality: 'available',
    basalUnits: 15,
    bolusUnits: 8,
    totalUnits: 23,
  },
  weekAverage: {
    quality: 'available',
    basalUnits: 20,
    bolusUnits: 9,
    totalUnits: 29,
  },
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
  it.each([
    ['en', 'Cached glucose · fetched'],
    ['he', 'סוכר שמור · נטען'],
  ] as const)(
    'labels cached glucose and its source fetch time in %s while retaining the metrics',
    (locale, label) => {
      const overview = {
        ...base,
        glucoseFreshness: {
          kind: 'stale' as const,
          fetchedAtMs: new Date(2026, 8, 27, 8, 15).getTime(),
        },
      };
      const tree = mount(
        <DailyOverviewCard
          id="ranges"
          overview={overview}
          locale={locale}
          rangeStyle="ring"
          thresholds={thresholds}
        />,
      );
      expect(allText(tree)).toContain(label);
      expect(allText(tree)).toContain('27/9 08:15');
      expect(textAt(tree, 'daily-overview-tir-hero')).toBe('100%');
      const status = tree.root.findByProps({
        testID: 'daily-overview-glucose-freshness',
      });
      expect(status.props.accessibilityLabel).toBe(`${label} 27/9 08:15`);
      const timestamp = status
        .findAllByType(Text)
        .find(node => node.props.children === '27/9 08:15')!;
      expect(StyleSheet.flatten(timestamp.props.style).writingDirection).toBe(
        'ltr',
      );
    },
  );

  it('states unknown freshness for array-only data without inventing a fetch time', () => {
    const tree = mount(
      <DailyOverviewCard
        id="ranges"
        overview={base}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
      />,
    );
    const status = tree.root.findByProps({
      testID: 'daily-overview-glucose-freshness',
    });
    expect(status.props.accessibilityLabel).toBe('Glucose freshness unknown');
    expect(allText(tree)).not.toContain('Glucose fetched');
  });

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
    expect(allText(tree)).toContain('00:00–12:00');
    expect(allText(tree)).toContain('Recorded total');
    expect(allText(tree)).not.toContain('Estimated');
    const scaled = tree.root
      .findAllByType(InsulinSplitGraphic)
      .filter(node => node.props.maximum !== undefined);
    expect(scaled.map(node => node.props.maximum)).toEqual([29, 29]);
  });

  it('prefers a complete recorded total over explicit estimates in hero and comparison', () => {
    const overview = {
      ...base,
      insulinSummary: {
        ...base.insulinSummary,
        quality: 'available' as const,
        basalUnits: 18,
        bolusUnits: 8,
        totalUnits: 26,
        estimatedBasalUnits: 20,
        estimatedTotalUnits: 28,
      },
    };
    const tree = mount(
      <DailyOverviewCard
        id="insulin"
        overview={overview}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
        insulinComparison={{
          ...comparison,
          yesterday: {
            quality: 'available',
            basalUnits: 15,
            bolusUnits: 8,
            estimatedBasalUnits: 18,
            estimatedTotalUnits: 26,
          },
        }}
      />,
    );
    expect(textAt(tree, 'daily-overview-insulin-total')).toBe('26 U');
    expect(textAt(tree, 'daily-overview-insulin-delta')).toBe('+3 U');
    expect(
      tree.root.findAllByProps({
        testID: 'daily-overview-insulin-estimated-total',
      }),
    ).toHaveLength(0);
    expect(allText(tree)).toContain('Recorded total');
    expect(allText(tree)).not.toContain('Estimated total');
  });

  it('keeps actual basal in a mixed actual-versus-estimated comparison chart', () => {
    const tree = mount(
      <DailyOverviewCard
        id="insulin"
        overview={base}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
        insulinComparison={{
          ...comparison,
          yesterday: {
            quality: 'partial',
            basalUnits: 1,
            bolusUnits: 8,
            basalCoveragePercent: 20,
            estimatedBasalUnits: 17,
            estimatedTotalUnits: 25,
          },
        }}
      />,
    );
    expect(textAt(tree, 'daily-overview-insulin-total')).toBe('26 U');
    expect(textAt(tree, 'daily-overview-insulin-delta')).toBe('+1 U');
    expect(allText(tree)).toContain('Estimated total');
    const graphics = tree.root
      .findAllByType(InsulinSplitGraphic)
      .filter(node => node.props.maximum !== undefined);
    expect(graphics.map(node => node.props.insulin)).toEqual([
      {basalUnits: 18, bolusUnits: 8},
      {basalUnits: 17, bolusUnits: 8},
    ]);
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
    expect(
      tree.root.findAllByProps({
        testID: 'daily-overview-insulin-basal-percent',
      }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({
        testID: 'daily-overview-insulin-bolus-percent',
      }),
    ).toHaveLength(0);
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
      yesterday: {
        quality: 'available' as const,
        basalUnits: 0.009,
        bolusUnits: 0,
        totalUnits: 0.01,
      },
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
      yesterday: {
        quality: 'available' as const,
        basalUnits: 0.005,
        bolusUnits: 0,
        totalUnits: 0.005,
      },
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
    expect(allText(full)).toContain('00:00–12:00');
  });

  it('shows the exact date and cutoff with recorded bolus while basal is unknown', () => {
    const day = new Date(2026, 8, 28).getTime();
    const cutoff = new Date(2026, 8, 28, 10, 56).getTime();
    const overview = {
      ...base,
      period: {startMs: day, endMs: new Date(2026, 8, 29).getTime()},
      observedPeriod: {startMs: day, endMs: cutoff},
      isPartialDay: true,
      insulinSummary: {
        quality: 'partial' as const,
        bolusUnits: 8.2,
        basalCoveredMs: 0,
        basalCoveragePercent: 0,
      },
    };
    const history: DailyInsulinComparisonPresentation = {
      status: 'available',
      yesterday: {quality: 'partial', bolusUnits: 6.2, basalCoveragePercent: 0},
      weekAverage: {
        quality: 'partial',
        bolusUnits: 7.2,
        basalCoveragePercent: 0,
      },
      weekDays: 7,
      cutoffTimestampMs: cutoff,
      isPartialDay: true,
    };
    const tree = mount(
      <DailyOverviewCard
        id="insulin"
        overview={overview}
        locale="he"
        rangeStyle="ring"
        thresholds={thresholds}
        insulinComparison={history}
      />,
    );
    const label = (testID: string) =>
      tree.root
        .findAllByProps({testID})
        .find(node => node.props.accessibilityLabel)?.props.accessibilityLabel;
    expect(label('daily-overview-insulin-period')).toBe(
      'היום · 28/9 · 00:00–10:56',
    );
    expect(label('daily-overview-comparison-current-period')).toBe(
      'היום · 28/9 · 00:00–10:56',
    );
    expect(label('daily-overview-comparison-baseline-period')).toBe(
      'אתמול · 27/9 · 00:00–10:56',
    );
    expect(textAt(tree, 'daily-overview-insulin-recorded-bolus')).toBe('8.2 U');
    expect(textAt(tree, 'daily-overview-insulin-basal')).toBe('—');
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-insulin-total'}),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({
        testID: 'daily-overview-insulin-basal-percent',
      }),
    ).toHaveLength(0);
    expect(allText(tree)).toContain('אין תיעוד מלא של בזאל שניתן');
    expect(allText(tree)).toContain('השוואת בולוס מתועד');
    expect(textAt(tree, 'daily-overview-insulin-delta')).toBe('+2 U');
    act(() =>
      tree.root
        .findByProps({testID: 'daily-overview-compare-week'})
        .props.onPress(),
    );
    expect(textAt(tree, 'daily-overview-insulin-delta')).toBe('+1 U');
    expect(label('daily-overview-comparison-baseline-period')).toBe(
      'ממוצע 7 ימים · 21/9–27/9 · 00:00–10:56',
    );
    const weeklyPeriod = tree.root
      .findAllByProps({testID: 'daily-overview-comparison-baseline-period'})
      .find(node => node.props.accessibilityLabel)!;
    for (const numericRun of ['21/9–27/9', '00:00–10:56']) {
      const text = weeklyPeriod
        .findAllByType(Text)
        .find(node => node.props.children === numericRun)!;
      expect(text).toBeDefined();
      expect(StyleSheet.flatten(text.props.style).writingDirection).toBe('ltr');
    }
  });

  it('labels partial basal as a subtotal and rejects legacy scheduled estimates', () => {
    const partial = {
      ...base,
      insulinSummary: {
        quality: 'partial' as const,
        basalUnits: 1.3,
        bolusUnits: 4,
        basalCoveredMs: 7200000,
        basalCoveragePercent: 40,
      },
    };
    const tree = mount(
      <DailyOverviewCard
        id="insulin"
        overview={partial}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
      />,
    );
    expect(textAt(tree, 'daily-overview-insulin-basal')).toBe('1.3 U');
    expect(textAt(tree, 'daily-overview-insulin-recorded-subtotal')).toBe(
      '5.3 U',
    );
    expect(allText(tree)).toContain('Recorded subtotal');
    expect(textAt(tree, 'daily-overview-insulin-unavailable-total')).toBe('—');
    expect(allText(tree)).toContain('Daily total unavailable');
    expect(allText(tree)).toContain('40% of the time covered by basal records');
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-insulin-total'}),
    ).toHaveLength(0);
    const legacy = {
      ...base,
      insulinSummary: {
        quality: 'available' as const,
        basalUnits: 23.1,
        bolusUnits: 8,
        totalUnits: 31.1,
        basalEstimated: true,
      },
    };
    const old = mount(
      <DailyOverviewCard
        id="insulin"
        overview={legacy}
        locale="en"
        rangeStyle="ring"
        thresholds={thresholds}
      />,
    );
    expect(textAt(old, 'daily-overview-insulin-recorded-bolus')).toBe('8 U');
    expect(allText(old)).not.toContain('31.1 U');
    expect(allText(old)).not.toContain('23.1 U');
    expect(
      old.root.findAllByProps({testID: 'daily-overview-insulin-total'}),
    ).toHaveLength(0);
  });

  it.each([false, true])(
    'includes partial temp basal in the daily comparison with estimate=%s',
    estimated => {
      const insulinSummary = {
        quality: 'partial' as const,
        basalUnits: 1.8,
        bolusUnits: 2,
        basalCoveredMs: 3_600_000,
        basalCoveragePercent: 33,
        ...(estimated
          ? {estimatedBasalUnits: 3.8, estimatedTotalUnits: 5.8}
          : {}),
      };
      const history: DailyInsulinComparisonPresentation = {
        ...comparison,
        yesterday: {
          ...insulinSummary,
          basalUnits: 1,
          ...(estimated
            ? {estimatedBasalUnits: 3, estimatedTotalUnits: 5}
            : {}),
        },
      };
      const tree = mount(
        <DailyOverviewCard
          id="insulin"
          overview={{...base, insulinSummary}}
          locale="he"
          rangeStyle="ring"
          thresholds={thresholds}
          insulinComparison={history}
        />,
      );
      expect(textAt(tree, 'daily-overview-insulin-delta')).toBe(
        estimated ? '+0.8 U' : '0 U',
      );
      expect(
        textAt(
          tree,
          estimated
            ? 'daily-overview-insulin-estimated-total'
            : 'daily-overview-insulin-recorded-subtotal',
        ),
      ).toBe(estimated ? '5.8 U' : '3.8 U');
      expect(allText(tree)).toContain(
        estimated ? 'סה״כ משוער' : 'השוואת בולוס מתועד',
      );
      expect(allText(tree)).toContain('33% מהזמן מכוסה בתיעוד בזאל');
      const graphics = tree.root
        .findAllByType(InsulinSplitGraphic)
        .filter(node => node.props.maximum !== undefined);
      expect(graphics.map(node => node.props.insulin)).toEqual(
        estimated
          ? [
              {basalUnits: 3.8, bolusUnits: 2},
              {basalUnits: 3, bolusUnits: 2},
            ]
          : [
              {basalUnits: 0, bolusUnits: 2},
              {basalUnits: 0, bolusUnits: 2},
            ],
      );
      if (estimated) {
        expect(textAt(tree, 'daily-overview-insulin-estimated-basal')).toBe(
          '3.8 U',
        );
        expect(textAt(tree, 'daily-overview-insulin-basal')).toBe('1.8 U');
        const estimatedAmount = tree.root
          .findAllByProps({testID: 'daily-overview-insulin-estimated-basal'})
          .find(node => node.type === Text)!;
        const recordedAmount = tree.root
          .findAllByProps({testID: 'daily-overview-insulin-basal'})
          .find(node => node.type === Text)!;
        expect(
          StyleSheet.flatten(estimatedAmount.props.style).fontSize,
        ).toBeGreaterThan(
          StyleSheet.flatten(recordedAmount.props.style).fontSize,
        );
        expect(
          textAt(tree, 'daily-overview-insulin-estimate-recorded-subtotal'),
        ).toBe('סכום חלקי מתועד: 3.8 U');
      }
    },
  );
});
