import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {ThemeProvider} from 'styled-components/native';

import StackedHomeCharts from '../src/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import {theme} from '../src/style/theme';

let mockTouchTimeMs = 0;
let mockTooltipAutoHide = false;
let mockEmitTooltipOnMount = true;
let lastMockCgmGraphProps: any = null;

jest.mock('app/components/charts/CgmGraph/CgmGraph', () => {
  const MockReact = require('react');
  const {View} = require('react-native');

  return function MockCgmGraph(props: any) {
    const {onTooltipChange} = props;
    lastMockCgmGraphProps = props;
    MockReact.useEffect(() => {
      if (!mockEmitTooltipOnMount) {
        return;
      }
      onTooltipChange?.({
        touchTimeMs: mockTouchTimeMs,
        anchorTimeMs: mockTouchTimeMs,
        autoHide: mockTooltipAutoHide,
      });
      return () => onTooltipChange?.(null);
    }, [onTooltipChange]);

    return MockReact.createElement(View, {testID: 'mock.cgmGraph'});
  };
});

describe('StackedHomeCharts tooltip docking', () => {
  beforeEach(() => {
    mockTooltipAutoHide = false;
    mockEmitTooltipOnMount = true;
    lastMockCgmGraphProps = null;
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('auto-docks tooltip to the left when cursor is on the right half', async () => {
    const start = Date.UTC(2026, 0, 7, 0, 0, 0);
    const end = start + 1000;

    mockTouchTimeMs = start + 800; // right side

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <StackedHomeCharts
            testID="stacked"
            bgSamples={[
              {
                sgv: 110,
                date: start,
                dateString: new Date(start).toISOString(),
                trend: 0,
                direction: 'Flat',
                device: 'mock',
                type: 'sgv',
              } as any,
            ]}
            foodItems={null}
            insulinData={[]}
            width={400}
            cgmHeight={240}
            miniChartHeight={80}
            xDomain={[new Date(start), new Date(end)]}
            showFullScreenButton={false}
            tooltipPlacement="inside"
            tooltipAlign="auto"
            tooltipFullWidth={false}
          />
        </ThemeProvider>,
      );
    });

    const dock = tree!.root.findByProps({testID: 'stacked.tooltipDock'});

    expect(dock.props.$align).toBe('left');

    await act(async () => tree!.unmount());
  });

  it('auto-docks tooltip to the right when cursor is on the left half', async () => {
    const start = Date.UTC(2026, 0, 7, 0, 0, 0);
    const end = start + 1000;

    mockTouchTimeMs = start + 200; // left side

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <StackedHomeCharts
            testID="stacked"
            bgSamples={[
              {
                sgv: 110,
                date: start,
                dateString: new Date(start).toISOString(),
                trend: 0,
                direction: 'Flat',
                device: 'mock',
                type: 'sgv',
              } as any,
            ]}
            foodItems={null}
            insulinData={[]}
            width={400}
            cgmHeight={240}
            miniChartHeight={80}
            xDomain={[new Date(start), new Date(end)]}
            showFullScreenButton={false}
            tooltipPlacement="inside"
            tooltipAlign="auto"
            tooltipFullWidth={false}
          />
        </ThemeProvider>,
      );
    });

    const dock = tree!.root.findByProps({testID: 'stacked.tooltipDock'});

    expect(dock.props.$align).toBe('right');

    await act(async () => tree!.unmount());
  });

  it('observes mini-chart touches without taking over scroll responder ownership', async () => {
    const start = Date.UTC(2026, 0, 7, 0, 0, 0);
    const end = start + 1000;

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <StackedHomeCharts
            testID="stacked"
            bgSamples={[
              {
                sgv: 110,
                date: start,
                dateString: new Date(start).toISOString(),
                trend: 0,
                direction: 'Flat',
                device: 'mock',
                type: 'sgv',
              } as any,
            ]}
            foodItems={null}
            insulinData={[]}
            width={400}
            cgmHeight={240}
            miniChartHeight={80}
            xDomain={[new Date(start), new Date(end)]}
            showFullScreenButton={false}
            tooltipPlacement="inside"
          />
        </ThemeProvider>,
      );
    });

    const responderOwners = tree!.root.findAll(
      node =>
        typeof node.props.onStartShouldSetResponder === 'function' ||
        typeof node.props.onMoveShouldSetResponder === 'function',
    );
    const touchObservers = tree!.root.findAll(
      node =>
        typeof node.props.onTouchStart === 'function' &&
        typeof node.props.onTouchMove === 'function' &&
        typeof node.props.onTouchCancel === 'function',
    );

    expect(responderOwners).toHaveLength(0);
    expect(touchObservers.length).toBeGreaterThan(0);

    await act(async () => tree!.unmount());
  });

  it('drives the main CGM tooltip from the parent touch observer', async () => {
    const start = Date.UTC(2026, 0, 7, 0, 0, 0);
    const end = start + 1000;
    mockEmitTooltipOnMount = false;

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <StackedHomeCharts
            testID="stacked"
            bgSamples={[
              {
                sgv: 110,
                date: start,
                dateString: new Date(start).toISOString(),
                trend: 0,
                direction: 'Flat',
                device: 'mock',
                type: 'sgv',
              } as any,
            ]}
            foodItems={null}
            insulinData={[]}
            width={400}
            cgmHeight={240}
            miniChartHeight={80}
            xDomain={[new Date(start), new Date(end)]}
            showFullScreenButton={false}
            tooltipPlacement="inside"
          />
        </ThemeProvider>,
      );
    });

    expect(lastMockCgmGraphProps?.handleTouchEvents).toBe(false);
    expect(
      tree!.root.findAllByProps({testID: 'stacked.tooltipDock'}),
    ).toHaveLength(0);

    const cgmTouchArea = tree!.root.findByProps({
      testID: 'stacked.cgmTouchArea',
    });

    await act(async () => {
      cgmTouchArea.props.onTouchStart({
        nativeEvent: {locationX: 200},
      });
    });

    expect(
      tree!.root.findAllByProps({testID: 'stacked.tooltipDock'}).length,
    ).toBeGreaterThan(0);

    await act(async () => tree!.unmount());
  });

  it('preserves parent-driven CGM tooltip after touch cancel takeover', async () => {
    jest.useFakeTimers();

    const start = Date.UTC(2026, 0, 7, 0, 0, 0);
    const end = start + 1000;
    mockEmitTooltipOnMount = false;

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <StackedHomeCharts
            testID="stacked"
            bgSamples={[
              {
                sgv: 110,
                date: start,
                dateString: new Date(start).toISOString(),
                trend: 0,
                direction: 'Flat',
                device: 'mock',
                type: 'sgv',
              } as any,
            ]}
            foodItems={null}
            insulinData={[]}
            width={400}
            cgmHeight={240}
            miniChartHeight={80}
            xDomain={[new Date(start), new Date(end)]}
            showFullScreenButton={false}
            tooltipPlacement="inside"
          />
        </ThemeProvider>,
      );
    });

    const cgmTouchArea = tree!.root.findByProps({
      testID: 'stacked.cgmTouchArea',
    });

    act(() => {
      cgmTouchArea.props.onTouchStart({
        nativeEvent: {locationX: 200},
      });
      cgmTouchArea.props.onTouchCancel();
    });

    expect(
      tree!.root.findAllByProps({testID: 'stacked.tooltipDock'}).length,
    ).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(4500);
    });

    expect(
      tree!.root.findAllByProps({testID: 'stacked.tooltipDock'}),
    ).toHaveLength(0);

    await act(async () => tree!.unmount());
  });

  it('continues tracking tooltip x from page touch moves after ScrollView takeover', async () => {
    const start = Date.UTC(2026, 0, 7, 0, 0, 0);
    const end = start + 1000;
    mockEmitTooltipOnMount = false;

    const onTouchSessionChange = jest.fn();
    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <StackedHomeCharts
            testID="stacked"
            bgSamples={[
              {
                sgv: 110,
                date: start,
                dateString: new Date(start).toISOString(),
                trend: 0,
                direction: 'Flat',
                device: 'mock',
                type: 'sgv',
              } as any,
            ]}
            foodItems={null}
            insulinData={[]}
            width={400}
            cgmHeight={240}
            miniChartHeight={80}
            xDomain={[new Date(start), new Date(end)]}
            showFullScreenButton={false}
            tooltipPlacement="inside"
            tooltipAlign="auto"
            tooltipFullWidth={false}
            onTouchSessionChange={onTouchSessionChange}
          />
        </ThemeProvider>,
      );
    });

    const cgmTouchArea = tree!.root.findByProps({
      testID: 'stacked.cgmTouchArea',
    });

    act(() => {
      cgmTouchArea.props.onTouchStart({
        nativeEvent: {locationX: 117, pageX: 117},
      });
      cgmTouchArea.props.onTouchCancel();
    });

    expect(tree!.root.findByProps({testID: 'stacked.tooltipDock'}).props.$align).toBe('right');

    const activeSessions = onTouchSessionChange.mock.calls
      .map(([session]) => session)
      .filter(Boolean);
    const activeSession = activeSessions[activeSessions.length - 1];

    act(() => {
      activeSession.handlePageTouchMove({
        nativeEvent: {pageX: 318},
      });
    });

    expect(tree!.root.findByProps({testID: 'stacked.tooltipDock'}).props.$align).toBe('left');

    await act(async () => tree!.unmount());
  });

  it('keeps active touch tooltip visible while the finger is held still', async () => {
    jest.useFakeTimers();

    const start = Date.UTC(2026, 0, 7, 0, 0, 0);
    const end = start + 1000;
    mockTouchTimeMs = start + 500;
    mockTooltipAutoHide = false;

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <StackedHomeCharts
            testID="stacked"
            bgSamples={[
              {
                sgv: 110,
                date: start,
                dateString: new Date(start).toISOString(),
                trend: 0,
                direction: 'Flat',
                device: 'mock',
                type: 'sgv',
              } as any,
            ]}
            foodItems={null}
            insulinData={[]}
            width={400}
            cgmHeight={240}
            miniChartHeight={80}
            xDomain={[new Date(start), new Date(end)]}
            showFullScreenButton={false}
            tooltipPlacement="inside"
          />
        </ThemeProvider>,
      );
    });

    expect(
      tree!.root.findAllByProps({testID: 'stacked.tooltipDock'}).length,
    ).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(4500);
    });

    expect(
      tree!.root.findAllByProps({testID: 'stacked.tooltipDock'}).length,
    ).toBeGreaterThan(0);

    await act(async () => tree!.unmount());
  });

  it('auto-hides preserved tooltip after touch cancel if no release arrives', async () => {
    jest.useFakeTimers();

    const start = Date.UTC(2026, 0, 7, 0, 0, 0);
    const end = start + 1000;
    mockTouchTimeMs = start + 500;
    mockTooltipAutoHide = true;

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <StackedHomeCharts
            testID="stacked"
            bgSamples={[
              {
                sgv: 110,
                date: start,
                dateString: new Date(start).toISOString(),
                trend: 0,
                direction: 'Flat',
                device: 'mock',
                type: 'sgv',
              } as any,
            ]}
            foodItems={null}
            insulinData={[]}
            width={400}
            cgmHeight={240}
            miniChartHeight={80}
            xDomain={[new Date(start), new Date(end)]}
            showFullScreenButton={false}
            tooltipPlacement="inside"
          />
        </ThemeProvider>,
      );
    });

    expect(
      tree!.root.findAllByProps({testID: 'stacked.tooltipDock'}).length,
    ).toBeGreaterThan(0);

    act(() => {
      jest.advanceTimersByTime(4500);
    });

    expect(
      tree!.root.findAllByProps({testID: 'stacked.tooltipDock'}),
    ).toHaveLength(0);

    await act(async () => tree!.unmount());
  });

  it('emits external tooltip model when tooltip content changes at the same anchor time', async () => {
    const start = Date.UTC(2026, 0, 7, 0, 0, 0);
    const end = start + 1000;
    mockTouchTimeMs = start;

    const onTooltipModelChange = jest.fn();

    const renderChart = (sgv: number) => (
      <ThemeProvider theme={theme}>
        <StackedHomeCharts
          testID="stacked"
          bgSamples={[
            {
              sgv,
              date: start,
              dateString: new Date(start).toISOString(),
              trend: 0,
              direction: 'Flat',
              device: 'mock',
              type: 'sgv',
            } as any,
          ]}
          foodItems={null}
          insulinData={[]}
          width={400}
          cgmHeight={240}
          miniChartHeight={80}
          xDomain={[new Date(start), new Date(end)]}
          showFullScreenButton={false}
          tooltipPlacement="none"
          onTooltipModelChange={onTooltipModelChange}
        />
      </ThemeProvider>
    );

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(renderChart(110));
    });

    await act(async () => {
      tree!.update(renderChart(125));
    });

    const visibleModels = onTooltipModelChange.mock.calls
      .map(([model]) => model)
      .filter(model => model.visible);

    expect(visibleModels.map(model => model.bgSample?.sgv)).toContain(110);
    expect(visibleModels.map(model => model.bgSample?.sgv)).toContain(125);

    await act(async () => tree!.unmount());
  });
});
