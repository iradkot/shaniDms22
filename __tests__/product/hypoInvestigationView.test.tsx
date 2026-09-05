import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native';
import type {TrendsDataSource, TrendsPeriod} from 'app/modules/trends';
import {HypoInvestigationModuleView} from 'app/product/hypoInvestigation';

const DAY_MS = 24 * 60 * 60 * 1000;

const allText = (tree: renderer.ReactTestRenderer): string =>
  tree.root
    .findAllByType(Text)
    .map(node => String(node.props.children ?? ''))
    .join('\n');

describe('HypoInvestigationModuleView', () => {
  const thresholds = {
    veryLowMaxMgDl: 54,
    targetMinMgDl: 70,
    targetMaxMgDl: 180,
    highMaxMgDl: 250,
  } as const;

  it('uses a contextual period and only opens actions after the event is selected', async () => {
    const focus = {kind: 'period', startMs: 90 * DAY_MS, endMs: 100 * DAY_MS} as const;
    const loadGlucoseSamples = jest.fn(async (period: TrendsPeriod) => [
      {timestampMs: period.startMs + 5 * 60 * 1000, valueMgDl: 65},
      {timestampMs: period.startMs + 10 * 60 * 1000, valueMgDl: 50},
      {timestampMs: period.startMs + 15 * 60 * 1000, valueMgDl: 90},
    ]);
    const dataSource: TrendsDataSource = {loadGlucoseSamples};
    const onOpenDayGraph = jest.fn();
    const onFindSimilar = jest.fn();
    const onAskAi = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <HypoInvestigationModuleView
          dataSource={dataSource}
          expectedSampleIntervalMs={5 * 60 * 1000}
          focus={focus}
          locale="en"
          onAskAi={onAskAi}
          onFindSimilar={onFindSimilar}
          onOpenDayGraph={onOpenDayGraph}
          thresholds={thresholds}
        />,
      );
    });

    expect(loadGlucoseSamples).toHaveBeenCalledWith({
      startMs: focus.startMs,
      endMs: focus.endMs,
    });
    expect(tree!.root.findAllByProps({testID: 'hypo-event-actions'})).toHaveLength(0);
    act(() =>
      tree!.root.findByProps({testID: `hypo-event-${focus.startMs + 5 * 60 * 1000}`}).props.onPress(),
    );
    expect(onOpenDayGraph).not.toHaveBeenCalled();
    expect(tree!.root.findByProps({testID: 'hypo-event-actions'})).toBeTruthy();

    act(() => tree!.root.findByProps({testID: 'hypo-open-day-graph'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'hypo-find-similar'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'hypo-ask-ai'}).props.onPress());
    expect(onOpenDayGraph).toHaveBeenCalledTimes(1);
    expect(onFindSimilar).toHaveBeenCalledTimes(1);
    expect(onAskAi).toHaveBeenCalledTimes(1);
    expect(allText(tree!)).toContain('No cause is inferred');
    act(() => tree!.unmount());
  });

  it('supports Hebrew and an honest empty state', async () => {
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <HypoInvestigationModuleView
          dataSource={{loadGlucoseSamples: async () => []}}
          locale="he"
          now={() => 100 * DAY_MS}
          onAskAi={jest.fn()}
          onFindSimilar={jest.fn()}
          onOpenDayGraph={jest.fn()}
          thresholds={thresholds}
        />,
      );
    });
    expect(allText(tree!)).toContain('לא נמצאו אירועי סוכר נמוך');
    expect(tree!.root.findByProps({testID: 'hypo-investigation-view'})).toBeTruthy();
    act(() => tree!.unmount());
  });

  it('loads the selected event context only after explicit confirmation', async () => {
    const focus = {
      kind: 'period',
      startMs: 90 * DAY_MS,
      endMs: 91 * DAY_MS,
    } as const;
    const eventStart = focus.startMs + 5 * 60 * 1000;
    const contextDataSource = {
      loadDayGraph: jest.fn(async () => ({
        glucoseSamples: [
          {
            identity: {sourceId: 'nightscout', recordId: 'bg-1'},
            timestampMs: eventStart,
            valueMgDl: 64,
          },
        ],
        timelineItems: [
          {
            kind: 'journal-meal' as const,
            identity: {sourceId: 'journal', recordId: 'meal-1'},
            sourceLabel: 'Journal',
            timestampMs: eventStart + 60_000,
            title: 'Snack',
            carbohydratesGrams: 12,
          },
        ],
        freshness: {kind: 'fresh' as const, fetchedAtMs: focus.endMs},
      })),
    };
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <HypoInvestigationModuleView
          contextDataSource={contextDataSource}
          dataSource={{
            loadGlucoseSamples: async () => [
              {timestampMs: eventStart, valueMgDl: 64},
              {timestampMs: eventStart + 5 * 60_000, valueMgDl: 90},
            ],
          }}
          focus={focus}
          locale="en"
          onAskAi={jest.fn()}
          onFindSimilar={jest.fn()}
          onOpenDayGraph={jest.fn()}
          thresholds={thresholds}
        />,
      );
    });
    act(() =>
      tree!.root
        .findByProps({testID: `hypo-event-${eventStart}`})
        .props.onPress(),
    );
    expect(contextDataSource.loadDayGraph).not.toHaveBeenCalled();
    await act(async () => {
      tree!.root.findByProps({testID: 'hypo-load-context'}).props.onPress();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(contextDataSource.loadDayGraph).toHaveBeenCalled();
    expect(tree!.root.findByProps({testID: 'hypo-event-context'})).toBeTruthy();
    expect(allText(tree!)).toContain('Snack');
    expect(allText(tree!)).toContain('does not prove');
    act(() => tree!.unmount());
  });

  it('exposes retry after a source error', async () => {
    const loadGlucoseSamples = jest
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce([]);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <HypoInvestigationModuleView
          dataSource={{loadGlucoseSamples}}
          locale="en"
          now={() => 100 * DAY_MS}
          onAskAi={jest.fn()}
          onFindSimilar={jest.fn()}
          onOpenDayGraph={jest.fn()}
          thresholds={thresholds}
        />,
      );
    });
    expect(tree!.root.findByProps({testID: 'hypo-investigation-error'})).toBeTruthy();
    await act(async () => {
      tree!.root.findByProps({testID: 'hypo-investigation-retry'}).props.onPress();
    });
    expect(loadGlucoseSamples).toHaveBeenCalledTimes(2);
    act(() => tree!.unmount());
  });
});
