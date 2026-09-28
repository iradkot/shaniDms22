import React from 'react';
import renderer, {act} from 'react-test-renderer';
import type {
  DailyInsulinComparisonPresentation,
  DailyInsulinComparisonRequest,
  DailyOverviewDataSource,
} from 'app/modules/dailyOverview';
import {DailyOverviewModuleView} from 'app/product/dailyOverview';
import {DailyOverviewCard} from 'app/product/dailyOverview/DailyOverviewCards';

const thresholds = {
  veryLowMaxMgDl: 54,
  targetMinMgDl: 70,
  targetMaxMgDl: 180,
  highMaxMgDl: 250,
};
const clock = new Date(2026, 8, 28, 10, 30).getTime();
const now = () => clock;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return {promise, resolve, reject};
};
const comparison = (
  totalUnits: number,
): DailyInsulinComparisonPresentation => ({
  status: 'available',
  weekDays: 7,
  cutoffTimestampMs: clock,
  isPartialDay: true,
  yesterday: {basalUnits: totalUnits, bolusUnits: 0, totalUnits},
});
const insulinProps = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(DailyOverviewCard)
    .find(card => card.props.id === 'insulin')!.props;
const snapshot: DailyOverviewDataSource['loadDailyOverview'] =
  async period => ({
    glucoseSamples: [{timestampMs: period.startMs, valueMgDl: 120}],
    insulinSummary: {quality: 'available', basalUnits: 10, bolusUnits: 2},
  });

describe('daily comparison loading', () => {
  it('renders the selected day before comparison history and shares one cutoff with both requests', async () => {
    const history = deferred<DailyInsulinComparisonPresentation>();
    const loadDailyOverview = jest.fn(snapshot);
    const loadDailyInsulinComparison = jest.fn<
      Promise<DailyInsulinComparisonPresentation>,
      [DailyInsulinComparisonRequest]
    >(() => history.promise);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DailyOverviewModuleView
          locale="en"
          now={now}
          thresholds={thresholds}
          dataSource={{loadDailyOverview, loadDailyInsulinComparison}}
        />,
      );
    });
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-content'}).length,
    ).toBeGreaterThan(0);
    expect(insulinProps(tree).insulinComparison.status).toBe('loading');
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-comparison-loading'})
        .length,
    ).toBeGreaterThan(0);
    expect(loadDailyOverview.mock.calls[0]?.[1]).toEqual({asOfMs: clock});
    expect(loadDailyInsulinComparison.mock.calls[0]?.[0]).toMatchObject({
      asOfMs: clock,
    });
    expect(loadDailyOverview.mock.invocationCallOrder[0]).toBeLessThan(
      loadDailyInsulinComparison.mock.invocationCallOrder[0]!,
    );
    await act(async () => {
      history.resolve(comparison(11));
    });
    expect(insulinProps(tree).insulinComparison.yesterday.totalUnits).toBe(11);
    act(() => tree.unmount());
  });

  it('keeps the daily summary when comparison loading fails', async () => {
    const history = deferred<DailyInsulinComparisonPresentation>();
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DailyOverviewModuleView
          locale="en"
          now={now}
          thresholds={thresholds}
          dataSource={{
            loadDailyOverview: snapshot,
            loadDailyInsulinComparison: () => history.promise,
          }}
        />,
      );
    });
    await act(async () => {
      history.reject(new Error('History offline'));
    });
    expect(insulinProps(tree).overview.insulinSummary.totalUnits).toBe(12);
    expect(insulinProps(tree).insulinComparison.status).toBe('unavailable');
    expect(
      tree.root.findAllByProps({
        testID: 'daily-overview-comparison-unavailable',
      }).length,
    ).toBeGreaterThan(0);
    expect(insulinProps(tree).insulinComparison.yesterday).toBeUndefined();
    expect(
      tree.root.findAllByProps({testID: 'daily-overview-error'}),
    ).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('ignores a late comparison for the previous selection', async () => {
    const first = deferred<DailyInsulinComparisonPresentation>();
    const second = deferred<DailyInsulinComparisonPresentation>();
    const loadDailyInsulinComparison = jest
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    let tree!: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <DailyOverviewModuleView
          locale="en"
          now={now}
          thresholds={thresholds}
          dataSource={{loadDailyOverview: snapshot, loadDailyInsulinComparison}}
        />,
      );
    });
    await act(async () => {
      tree.root
        .findAllByProps({testID: 'daily-overview-previous'})[0]!
        .props.onPress();
    });
    expect(insulinProps(tree).insulinComparison.status).toBe('loading');
    await act(async () => {
      second.resolve({...comparison(20), isPartialDay: false});
    });
    await act(async () => {
      first.resolve(comparison(99));
    });
    expect(insulinProps(tree).insulinComparison.yesterday.totalUnits).toBe(20);
    expect(insulinProps(tree).insulinComparison.isPartialDay).toBe(false);
    act(() => tree.unmount());
  });
});
