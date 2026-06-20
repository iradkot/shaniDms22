import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {ThemeProvider} from 'styled-components/native';

import StackedHomeCharts from '../src/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import {theme} from '../src/style/theme';

let mockTouchTimeMs = 0;

jest.mock('app/components/charts/CgmGraph/CgmGraph', () => {
  const MockReact = require('react');
  const {View} = require('react-native');

  return function MockCgmGraph(props: any) {
    const {onTooltipChange} = props;
    MockReact.useEffect(() => {
      onTooltipChange?.({
        touchTimeMs: mockTouchTimeMs,
        anchorTimeMs: mockTouchTimeMs,
      });
      return () => onTooltipChange?.(null);
    }, [onTooltipChange]);

    return MockReact.createElement(View, {testID: 'mock.cgmGraph'});
  };
});

describe('StackedHomeCharts tooltip docking', () => {
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
});
