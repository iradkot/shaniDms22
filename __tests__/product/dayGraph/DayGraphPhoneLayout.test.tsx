import React, {Profiler} from 'react';
import renderer, {act} from 'react-test-renderer';
import * as RN from 'react-native';
import {DayGraphModuleView} from 'app/product/dayGraph/DayGraphModuleView';
import {RichDayGraphChart} from 'app/product/dayGraph/RichDayGraphChart';
import {ProductPage} from 'app/product/ui';
import type {DayGraphPeriod, DayGraphSnapshot} from 'app/modules/dayGraph';
import {getThemeById} from 'app/style/theme';
import {withTheme} from '../../mocks/withTheme';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({width: 390, height: 844, scale: 1, fontScale: 1})),
}));

const HOUR_MS = 3_600_000;
const DAY_START = new Date(2026, 8, 7).getTime();
const now = () => DAY_START + 12 * HOUR_MS;
const theme = getThemeById('darkFocus');
const snapshot = (period: DayGraphPeriod): DayGraphSnapshot => ({
  freshness: {kind: 'fresh', fetchedAtMs: period.dayStartMs + HOUR_MS},
  glucoseSamples: [
    {
      identity: {sourceId: 'ns', recordId: 'glucose'},
      timestampMs: period.dayStartMs + HOUR_MS,
      valueMgDl: 120,
    },
    {
      identity: {sourceId: 'ns', recordId: 'after-gap'},
      timestampMs: period.dayStartMs + 6 * HOUR_MS,
      valueMgDl: 125,
    },
  ],
  timelineItems: [
    {
      identity: {sourceId: 'journal', recordId: 'meal'},
      sourceLabel: 'ShaniDms',
      kind: 'journal-meal',
      title: 'Breakfast',
      timestampMs: period.dayStartMs + 8 * HOUR_MS,
    },
  ],
});
const layout = (node: renderer.ReactTestInstance, height: number, y = 0) =>
  act(() =>
    node.props.onLayout({nativeEvent: {layout: {height, y, x: 0, width: 390}}}),
  );
const press = (tree: renderer.ReactTestRenderer, testID: string) => {
  const button = tree.root
    .findAllByType(RN.Pressable)
    .find(node => node.props.testID === testID)!;
  act(() => button.props.onPress());
};
const page = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(RN.ScrollView)
    .find(node => node.props.testID === 'day-graph-module-view')!;

describe('Day Graph first native phone layout', () => {
  beforeEach(() =>
    jest.mocked(RN.useWindowDimensions).mockReturnValue({
      width: 390,
      height: 844,
      scale: 1,
      fontScale: 1,
    }),
  );

  it('uses the actual page viewport and chart offset, ignores invalid/repeated layouts, and does no extra data load', async () => {
    const load = jest.fn(async (period: DayGraphPeriod) => snapshot(period));
    const onRender = jest.fn();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <Profiler id="page" onRender={onRender}>
            <DayGraphModuleView
              locale="he"
              dataSource={{loadDayGraph: load}}
              now={now}
              preMealAssistance={{
                settings: {enabled: true, notificationsEnabled: false},
                dataSource: {
                  loadContext: async () => ({
                    relevance: {kind: 'inactive'},
                    sourceState: {kind: 'live'},
                  }),
                },
                intentActive: false,
                onStartIntent: jest.fn(),
              }}
            />
          </Profiler>,
          theme,
        ),
      );
    });
    const chartProps = () => tree!.root.findByType(RichDayGraphChart).props;
    expect(chartProps().availableHeight).toBeUndefined();
    layout(page(tree!), 660);
    expect(chartProps().availableHeight).toBeUndefined();
    layout(tree!.root.findByProps({testID: 'day-graph-chart-frame'}), 600, 56);
    expect(chartProps().availableHeight).toBe(660 - 56 - theme.spacing.sm);

    const commits = onRender.mock.calls.length;
    layout(page(tree!), 660.2);
    layout(
      tree!.root.findByProps({testID: 'day-graph-chart-frame'}),
      300,
      56.2,
    );
    layout(page(tree!), Number.NaN);
    layout(tree!.root.findByProps({testID: 'day-graph-chart-frame'}), 300, -10);
    expect(onRender).toHaveBeenCalledTimes(commits);
    expect(chartProps().availableHeight).toBe(596);
    expect(load).toHaveBeenCalledTimes(1);

    const phonePage = tree!.root.findByType(ProductPage);
    expect(phonePage.props.compact).toBe(true);
    expect(RN.StyleSheet.flatten(page(tree!).props.style).backgroundColor).toBe(
      theme.backgroundColor,
    );
    for (const id of ['previous', 'pick-date', 'next', 'refresh']) {
      const button = tree!.root
        .findAllByType(RN.Pressable)
        .find(node => node.props.testID === `day-graph-${id}`)!;
      const style =
        typeof button.props.style === 'function'
          ? button.props.style({pressed: false})
          : button.props.style;
      expect(RN.StyleSheet.flatten(style).minHeight).toBeGreaterThanOrEqual(44);
    }
    const orderedIds = tree!.root
      .findAll(node => typeof node.props.testID === 'string')
      .map(node => node.props.testID);
    expect(orderedIds.indexOf('day-graph-chart-frame')).toBeLessThan(
      orderedIds.indexOf('day-graph-accessible-summary'),
    );
    expect(orderedIds.indexOf('day-graph-chart-frame')).toBeLessThan(
      orderedIds.indexOf('day-graph-data-gaps'),
    );
    expect(orderedIds.indexOf('day-graph-chart-frame')).toBeLessThan(
      orderedIds.indexOf('pre-meal-intent-prompt'),
    );
    expect(
      tree!.root
        .findAllByType(RN.Text)
        .filter(
          node =>
            node.props.accessibilityRole === 'header' &&
            node.props.children === 'סוכר',
        ),
    ).toHaveLength(0);
    act(() => tree!.unmount());
  });

  it('keeps native date navigation and event focus while scrolling to the measured chart location', async () => {
    const load = jest.fn(async (period: DayGraphPeriod) => snapshot(period));
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            locale="en"
            dataSource={{loadDayGraph: load}}
            now={now}
          />,
          theme,
        ),
      );
    });
    layout(tree!.root.findByProps({testID: 'day-graph-chart-frame'}), 550, 56);
    press(tree!, 'day-graph-focus-meal');
    expect(
      tree!.root.findByType(RichDayGraphChart).props.selectedTimestampMs,
    ).toBe(DAY_START + 8 * HOUR_MS);
    expect(page(tree!).instance.scrollTo).toHaveBeenCalledWith({
      y: 56,
      animated: true,
    });
    expect(load).toHaveBeenCalledTimes(1);
    press(tree!, 'day-graph-previous');
    await act(async () => {});
    expect(load.mock.calls[1]![0].dayEndMs).toBe(DAY_START);
    press(tree!, 'day-graph-pick-date');
    press(tree!, 'day-graph-calendar-today');
    await act(async () => {});
    expect(load.mock.calls[2]![0].dayStartMs).toBe(DAY_START);
    const next = tree!.root
      .findAllByType(RN.Pressable)
      .find(node => node.props.testID === 'day-graph-next')!;
    expect(next.props.disabled).toBe(true);
    expect(
      tree!.root.findByType(RichDayGraphChart).props.selectedTimestampMs,
    ).toBeUndefined();
    act(() => tree!.unmount());
  });

  it('keeps the regular wide page header and lets the rich chart choose its own wide height', async () => {
    jest
      .mocked(RN.useWindowDimensions)
      .mockReturnValue({width: 1024, height: 900, scale: 1, fontScale: 1});
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        withTheme(
          <DayGraphModuleView
            locale="en"
            dataSource={{loadDayGraph: async period => snapshot(period)}}
            now={now}
          />,
          theme,
        ),
      );
    });
    layout(page(tree!), 720);
    layout(tree!.root.findByProps({testID: 'day-graph-chart-frame'}), 700, 300);
    expect(tree!.root.findByType(ProductPage).props.header).toBeUndefined();
    expect(
      tree!.root.findByType(RichDayGraphChart).props.availableHeight,
    ).toBeUndefined();
    const orderedIds = tree!.root
      .findAll(node => typeof node.props.testID === 'string')
      .map(node => node.props.testID);
    expect(orderedIds.indexOf('day-graph-accessible-summary')).toBeLessThan(
      orderedIds.indexOf('day-graph-chart-frame'),
    );
    act(() => tree!.unmount());
  });
});
