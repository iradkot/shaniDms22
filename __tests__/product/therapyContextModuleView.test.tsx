import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import {
  buildTrendsEvidenceMetadata,
  type TherapyContextDataSource,
  type TrendsPeriod,
} from 'app/modules/trends';
import {TherapyContextModuleView} from 'app/product/trends';

const DAY_MS = 24 * 60 * 60 * 1000;

const renderedText = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  return Array.isArray(value) ? value.map(renderedText).join('') : '';
};

const allText = (tree: renderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(Text)
    .map(node => renderedText(node.props.children))
    .join(' ');

const source = (): TherapyContextDataSource => ({
  loadTherapyContext: async (period: TrendsPeriod) => ({
    period,
    quality: {sourceReliability: 'reliable', coveragePercent: 80},
    evidence: buildTrendsEvidenceMetadata({
      period,
      coveragePercent: 80,
      coverageQuality: 'adequate',
      daysWithData: 14,
      expectedSampleIntervalMs: DAY_MS,
      lastReadingTimestampMs: period.endMs - DAY_MS,
      targetRange: {minMgDl: 70, maxMgDl: 180},
      timeZoneOffsetMinutes: 120,
    }),
    totals: {
      insulinUnits: 210,
      carbohydrateGrams: 420,
      mealCount: 18,
      activityMinutes: 95,
      aidAvailabilityPercent: 88,
    },
    aidModes: [
      {mode: 'closed-loop', observedHours: 220, targetRangePercent: 74},
      {mode: 'open-loop', observedHours: 30, targetRangePercent: 61},
    ],
  }),
});

describe('TherapyContextModuleView', () => {
  it('presents factual therapy and AID context with shared evidence metadata', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TherapyContextModuleView
          dataSource={source()}
          locale="en"
          now={() => 100 * DAY_MS}
          quality={{sourceReliability: 'reliable', coveragePercent: 80}}
        />,
      );
    });

    expect(
      tree!.root.findByProps({testID: 'trends-evidence-metadata'}),
    ).toBeTruthy();
    expect(allText(tree!)).toEqual(
      expect.stringContaining('Insulin recorded 210 U'),
    );
    expect(allText(tree!)).toEqual(
      expect.stringContaining('Closed Loop periods 220 hours · 74% in range'),
    );
    expect(allText(tree!)).toContain(
      'These are observations from the same periods. They do not establish why values differed.',
    );
    expect(allText(tree!)).not.toMatch(/recommend|caused|improved|worsened/i);
    act(() => tree!.unmount());
  });

  it('fails closed before loading when source classification is unverified', async () => {
    const dataSource = source();
    const load = jest.spyOn(dataSource, 'loadTherapyContext');
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TherapyContextModuleView
          dataSource={dataSource}
          locale="he"
          now={() => 100 * DAY_MS}
          quality={{sourceReliability: 'unverified', coveragePercent: 100}}
        />,
      );
    });

    expect(load).not.toHaveBeenCalled();
    expect(
      tree!.root.findByProps({testID: 'therapy-context-unavailable'}),
    ).toBeTruthy();
    expect(allText(tree!)).toContain('המקור עדיין לא מסווג באופן אמין');
    act(() => tree!.unmount());
  });

  it('loads a direct destination without requiring an eager host quality request', async () => {
    const dataSource = source();
    const load = jest.spyOn(dataSource, 'loadTherapyContext');
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TherapyContextModuleView
          dataSource={dataSource}
          locale="en"
          now={() => 100 * DAY_MS}
        />,
      );
    });
    expect(load).toHaveBeenCalledTimes(1);
    expect(allText(tree!)).toContain('Insulin recorded 210 U');
    act(() => tree!.unmount());
  });

  it('applies the returned quality gate after loading a direct destination', async () => {
    const validSource = source();
    const dataSource: TherapyContextDataSource = {
      loadTherapyContext: async period => {
        const result = await validSource.loadTherapyContext(period);
        return {
          ...result,
          quality: {sourceReliability: 'reliable', coveragePercent: 20},
          evidence: {
            ...result.evidence,
            coveragePercent: 20,
            coverageQuality: 'low',
          },
        };
      },
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TherapyContextModuleView dataSource={dataSource} locale="en" />,
      );
    });
    expect(
      tree!.root.findByProps({testID: 'therapy-context-unavailable'}),
    ).toBeTruthy();
    expect(allText(tree!)).not.toContain('Insulin recorded 210 U');
    act(() => tree!.unmount());
  });
});
