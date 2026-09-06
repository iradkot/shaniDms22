import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {ThemeProvider} from 'styled-components/native';
import * as RN from 'react-native';
import Svg from 'react-native-svg';

import FullScreenViewScreen, {
  getStackedDisplayDomain,
  getStackedMinRangeRatio,
  getStackedSelectableDomain,
  getStackedFullScreenFrame,
  normalizeStackedRangeSelection,
  updateStackedRangeSelectionForThumb,
} from '../src/containers/FullScreen/FullScreenViewScreen';
import StackedHomeCharts from '../src/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import {ChartScrollView} from '../src/components/charts/interaction/ChartScrollView';
import MiniChartLane from '../src/components/charts/MiniChartLane';
import {theme} from '../src/style/theme';

jest.mock('react-native/Libraries/Utilities/useWindowDimensions', () => ({
  __esModule: true,
  default: jest.fn(() => ({width: 360, height: 720, scale: 1, fontScale: 1})),
}));

describe('FullScreenViewScreen stackedCharts mode', () => {
  beforeEach(() => {
    jest.useFakeTimers();

    jest.mocked(RN.useWindowDimensions).mockReturnValue({
      width: 360,
      height: 720,
      scale: 1,
      fontScale: 1,
    } as any);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('renders stacked charts without crashing', async () => {
    const now = Date.UTC(2026, 0, 7, 12, 0, 0);

    const bgSamples = [
      {
        sgv: 110,
        date: now - 5 * 60_000,
        dateString: new Date(now - 5 * 60_000).toISOString(),
        trend: 0,
        direction: 'Flat',
        device: 'mock',
        type: 'sgv',
        iob: 1.2,
        cob: 15,
      },
      {
        sgv: 112,
        date: now,
        dateString: new Date(now).toISOString(),
        trend: 0,
        direction: 'Flat',
        device: 'mock',
        type: 'sgv',
        iob: 1.1,
        cob: 14,
      },
    ];

    const foodItems = [
      {
        id: 'food-1',
        carbs: 25,
        name: 'Carbs',
        image: '',
        notes: '',
        score: 0,
        timestamp: now - 10 * 60_000,
      },
    ];

    const insulinData = [
      {
        type: 'bolus',
        amount: 1.0,
        timestamp: new Date(now - 8 * 60_000).toISOString(),
      },
      {
        type: 'tempBasal',
        rate: 0.9,
        duration: 30,
        startTime: new Date(now - 20 * 60_000).toISOString(),
        endTime: new Date(now + 10 * 60_000).toISOString(),
        timestamp: new Date(now - 20 * 60_000).toISOString(),
      },
    ];

    const basalProfileData = [
      {time: '00:00', value: 0.8, timeAsSeconds: 0},
      {time: '12:00', value: 1.0, timeAsSeconds: 12 * 3600},
    ];

    const navigation = {
      canGoBack: () => true,
      goBack: jest.fn(),
      getParent: () => null,
      navigate: jest.fn(),
    };

    const route = {
      params: {
        mode: 'stackedCharts',
        bgSamples,
        foodItems,
        insulinData,
        basalProfileData,
        xDomainMs: {startMs: now - 60 * 60_000, endMs: now + 60 * 60_000},
        fallbackAnchorTimeMs: now,
      },
    };

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <FullScreenViewScreen navigation={navigation} route={route} />
        </ThemeProvider>,
      );
    });

    expect(tree!.toJSON()).toBeTruthy();

    await act(async () => {
      tree!.unmount();
    });
  });

  it('uses onLayout height to reflow stacked charts', async () => {
    const now = Date.UTC(2026, 0, 7, 12, 0, 0);

    const bgSamples = [
      {
        sgv: 110,
        date: now - 5 * 60_000,
        dateString: new Date(now - 5 * 60_000).toISOString(),
        trend: 0,
        direction: 'Flat',
        device: 'mock',
        type: 'sgv',
      },
      {
        sgv: 112,
        date: now,
        dateString: new Date(now).toISOString(),
        trend: 0,
        direction: 'Flat',
        device: 'mock',
        type: 'sgv',
      },
    ];

    const navigation = {
      canGoBack: () => true,
      goBack: jest.fn(),
      getParent: () => null,
      navigate: jest.fn(),
    };

    const route = {
      params: {
        mode: 'stackedCharts',
        bgSamples,
        foodItems: null,
        insulinData: [],
        basalProfileData: [],
        xDomainMs: {startMs: now - 60 * 60_000, endMs: now + 60 * 60_000},
        fallbackAnchorTimeMs: now,
      },
    };

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <FullScreenViewScreen navigation={navigation} route={route} />
        </ThemeProvider>,
      );
    });

    const stacked = tree!.root.findByType(StackedHomeCharts);
    expect(stacked.props.tooltipPlacement).toBe('inside');

    // Trigger an onLayout height update and ensure the heights reflow.
    const contentWithOnLayout = tree!.root.findAll(
      n => typeof n?.props?.onLayout === 'function',
    )[0];
    const beforeMini = stacked.props.miniChartHeight;

    await act(async () => {
      contentWithOnLayout.props.onLayout({
        nativeEvent: {layout: {height: 520}},
      });
    });

    const stackedAfter = tree!.root.findByType(StackedHomeCharts);
    expect(stackedAfter.props.miniChartHeight).not.toBe(beforeMini);
    expect(stackedAfter.props.cgmHeight).toBeGreaterThanOrEqual(220);
    expect(stackedAfter.props.miniChartHeight).toBeGreaterThanOrEqual(110);
    const chartScroll = tree!.root
      .findAllByType(RN.ScrollView)
      .find(node => node.props.testID === 'fullscreen.stackedChartScroll');
    expect(chartScroll!.props.scrollEnabled).toBe(true);
    const chartScrollHost = tree!.root.findByType(ChartScrollView);
    expect(chartScrollHost.props.testID).toBe('fullscreen.stackedChartScroll');
    expect(chartScrollHost.findByType(StackedHomeCharts)).toBe(stackedAfter);

    await act(async () => {
      tree!.unmount();
    });
  });

  it('keeps the overlay, bolus lane and range controls reachable in a short landscape viewport', async () => {
    jest
      .mocked(RN.useWindowDimensions)
      .mockReturnValue({width: 640, height: 320, scale: 1, fontScale: 1});
    const now = Date.UTC(2026, 0, 7, 12);
    const bgSamples = [now - 300_000, now].map(date => ({
      date,
      dateString: new Date(date).toISOString(),
      sgv: 110,
      iob: 1,
      cob: 10,
      trend: 0,
      direction: 'Flat',
      device: 'fixture',
      type: 'sgv',
    }));
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <FullScreenViewScreen
            navigation={{canGoBack: () => true, goBack: jest.fn()}}
            route={{
              params: {
                mode: 'stackedCharts',
                bgSamples,
                foodItems: [],
                basalProfileData: [{time: '00:00', value: 1}],
                insulinData: [
                  {
                    type: 'bolus',
                    amount: 2,
                    timestamp: new Date(now).toISOString(),
                  },
                ],
              },
            }}
          />
        </ThemeProvider>,
      );
    });
    const scrolls = tree!.root.findAllByType(RN.ScrollView);
    const chartScroll = scrolls.find(
      node => node.props.testID === 'fullscreen.stackedChartScroll',
    )!;
    const railScroll = scrolls.find(
      node => node.props.testID === 'fullscreen.stackedRailScroll',
    )!;
    expect(chartScroll.props.scrollEnabled).toBe(true);
    expect(chartScroll.props.removeClippedSubviews).toBe(false);
    expect(railScroll.props.scrollEnabled).toBe(true);
    const lanes = chartScroll.findAllByType(MiniChartLane);
    expect(lanes).toHaveLength(1);
    const overlay = chartScroll
      .findAllByType(Svg)
      .find(
        svg => svg.findAllByProps({testID: 'iob-line-segment'}).length > 0,
      )!;
    expect(overlay).toBeDefined();
    expect(
      overlay.findAllByProps({testID: 'cob-line-segment'}).length,
    ).toBeGreaterThan(0);
    expect(
      overlay.findAllByProps({testID: 'basal-scheduled-segment'}).length,
    ).toBeGreaterThan(0);
    const laneHeight = lanes.reduce(
      (total, lane) =>
        total +
        RN.StyleSheet.flatten(lane.findAllByType(RN.View)[0]!.props.style)
          .height,
      0,
    );
    const charts = chartScroll.findByType(StackedHomeCharts);
    expect(
      laneHeight + overlay.props.height + charts.props.cgmHeight,
    ).toBeGreaterThan(320);
    expect(charts.props.cgmHeight).toBeGreaterThanOrEqual(150);
    expect(charts.props.miniChartHeight).toBeGreaterThanOrEqual(110);
    expect(
      railScroll.findAllByProps({testID: 'fullscreen.stackedChartScroll'}),
    ).toHaveLength(0);
    expect(
      railScroll.findAllByProps({testID: 'fullscreen.stackedRangeStartSlider'})
        .length,
    ).toBeGreaterThan(0);
    expect(
      railScroll.findAllByProps({testID: 'fullscreen.stackedRangeEndSlider'})
        .length,
    ).toBeGreaterThan(0);
    act(() => tree!.unmount());
  });

  it('reserves a tooltip rail for stacked charts in landscape only', () => {
    const landscape = getStackedFullScreenFrame({
      contentWidth: 720,
      isLandscape: true,
    });
    expect(landscape.tooltipRailWidth).toBeGreaterThan(0);
    expect(landscape.chartWidth).toBeLessThan(720);
    expect(landscape.chartWidth + landscape.tooltipRailWidth).toBeLessThan(720);

    const portrait = getStackedFullScreenFrame({
      contentWidth: 360,
      isLandscape: false,
    });
    expect(portrait.tooltipRailWidth).toBe(0);
    expect(portrait.chartWidth).toBe(360);
  });

  it('builds the stacked chart selectable domain from available bg data', () => {
    const baseStartMs = Date.UTC(2026, 0, 7, 0, 0, 0);
    const baseEndMs = Date.UTC(2026, 0, 7, 23, 59, 0);
    const firstDataMs = Date.UTC(2026, 0, 7, 4, 0, 0);
    const lastDataMs = Date.UTC(2026, 0, 7, 18, 0, 0);

    const selectable = getStackedSelectableDomain({
      baseDomain: [new Date(baseStartMs), new Date(baseEndMs)],
      bgSamples: [
        {
          sgv: 104,
          date: lastDataMs,
          dateString: new Date(lastDataMs).toISOString(),
          trend: 0,
          direction: 'Flat',
          device: 'mock',
          type: 'sgv',
        },
        {
          sgv: 110,
          date: firstDataMs,
          dateString: new Date(firstDataMs).toISOString(),
          trend: 0,
          direction: 'Flat',
          device: 'mock',
          type: 'sgv',
        },
      ],
    });

    expect(selectable?.[0].getTime()).toBe(firstDataMs);
    expect(selectable?.[1].getTime()).toBe(lastDataMs);
  });

  it('builds a focused stacked chart display domain from start/end range selection', () => {
    const startMs = Date.UTC(2026, 0, 7, 0, 0, 0);
    const endMs = Date.UTC(2026, 0, 7, 14, 0, 0);

    const selectedMiddle = getStackedDisplayDomain({
      baseDomain: [new Date(startMs), new Date(endMs)],
      bgSamples: [],
      rangeSelection: {start: 2 / 14, end: 8 / 14},
    });

    expect(selectedMiddle?.[0].getTime()).toBe(startMs + 2 * 60 * 60 * 1000);
    expect(selectedMiddle?.[1].getTime()).toBe(startMs + 8 * 60 * 60 * 1000);

    const full = getStackedDisplayDomain({
      baseDomain: [new Date(startMs), new Date(endMs)],
      bgSamples: [],
      rangeSelection: {start: 0, end: 1},
    });

    expect(full?.[0].getTime()).toBe(startMs);
    expect(full?.[1].getTime()).toBe(endMs);

    const clamped = getStackedDisplayDomain({
      baseDomain: [new Date(startMs), new Date(endMs)],
      bgSamples: [],
      rangeSelection: {start: 0.9, end: 0.1},
    });

    expect(clamped?.[1].getTime()).toBeGreaterThan(clamped?.[0].getTime() ?? 0);
  });

  it('normalizes stacked range selections with the same minimum as the display domain', () => {
    const startMs = Date.UTC(2026, 0, 7, 0, 0, 0);
    const endMs = Date.UTC(2026, 0, 7, 10, 0, 0);
    const minRangeRatio = getStackedMinRangeRatio({
      selectableDomain: [new Date(startMs), new Date(endMs)],
    });

    expect(minRangeRatio).toBe(0.05);

    expect(
      normalizeStackedRangeSelection({start: 0.6, end: 0.61}, minRangeRatio),
    ).toEqual({start: 0.58, end: 0.63});

    expect(
      normalizeStackedRangeSelection({start: 0.99, end: 1}, minRangeRatio),
    ).toEqual({start: 0.95, end: 1});

    expect(
      normalizeStackedRangeSelection({start: 0.8, end: 0.2}, minRangeRatio),
    ).toEqual({start: 0.2, end: 0.8});
  });

  it('moves only the active range thumb and preserves the minimum range', () => {
    const movedStart = updateStackedRangeSelectionForThumb({
      selection: {start: 0.2, end: 0.8},
      thumb: 'start',
      ratio: 0.78,
      minRangeRatio: 0.1,
    });

    expect(movedStart.start).toBeCloseTo(0.7);
    expect(movedStart.end).toBeCloseTo(0.8);

    const movedEnd = updateStackedRangeSelectionForThumb({
      selection: {start: 0.2, end: 0.8},
      thumb: 'end',
      ratio: 0.22,
      minRangeRatio: 0.1,
    });

    expect(movedEnd.start).toBeCloseTo(0.2);
    expect(movedEnd.end).toBeCloseTo(0.3);
  });
});
