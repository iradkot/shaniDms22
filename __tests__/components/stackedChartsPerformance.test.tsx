import React from 'react';
import renderer, {act} from 'react-test-renderer';
import StackedHomeCharts from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts';
import CGMGraph from 'app/components/charts/CgmGraph/CgmGraph';
import HomeChartsTooltip from 'app/containers/MainTabsNavigator/Containers/Home/components/HomeChartsTooltip';
import * as chartPalette from 'app/components/charts/chartPalette';
import * as miniChartData from 'app/components/charts/miniChartData';
import {Circle, Line, Path, Rect} from 'react-native-svg';
import type {BgSample} from 'app/types/day_bgs.types';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import {getThemeById} from 'app/style/theme';
import {getEffectiveBasalRateAt} from 'app/utils/insulin.utils/basalDeliveryTimeline';
import {withTheme} from '../mocks/withTheme';

const DAY = 24 * 60 * 60 * 1000;
const bgSamples: BgSample[] = Array.from({length: 288}, (_, index) => ({
  date: index * 5 * 60000,
  dateString: new Date(index * 5 * 60000).toISOString(),
  sgv: 80 + (index % 160),
  trend: 4,
  direction: 'Flat',
  device: 'fixture',
  type: 'sgv',
}));
const loadSamples = bgSamples.map(sample => ({
  timestampMs: sample.date,
  iob: 1.5,
  cob: 20,
}));
const xDomain: [Date, Date] = [new Date(0), new Date(DAY)];
const insulinData: InsulinDataEntry[] = bgSamples.flatMap((sample, index) => [
  {
    type: 'tempBasal' as const,
    startTime: sample.dateString,
    duration: 5,
    rate: (index % 4) / 2,
  },
  ...(index % 4 === 0
    ? [{type: 'bolus' as const, timestamp: sample.dateString, amount: 0.25}]
    : []),
]);
const basalProfileData = [{time: '00:00', value: 0.75}];

describe('Production stacked chart selection work', () => {
  let tree!: renderer.ReactTestRenderer;
  afterEach(() => {
    if (tree) {
      act(() => tree.unmount());
    }
    jest.restoreAllMocks();
  });
  it('does not rebuild all glucose marks or normalize load history for each selection', () => {
    const colors = jest.spyOn(chartPalette, 'glucoseChartColor');
    const loads = jest.spyOn(miniChartData, 'resolveMiniLoadSamples');
    const paths = jest.spyOn(Path.prototype, 'render');
    act(() => {
      tree = renderer.create(
        withTheme(
          <StackedHomeCharts
            bgSamples={bgSamples}
            loadSamples={loadSamples}
            foodItems={null}
            width={390}
            cgmHeight={240}
            miniChartHeight={120}
            xDomain={xDomain}
            showFullScreenButton={false}
            tooltipPlacement="panel"
          />,
        ),
      );
    });
    const initialColors = colors.mock.calls.length;
    const initialLoads = loads.mock.calls.length;
    const initialPaths = paths.mock.calls.length;
    for (let index = 1; index <= 60; index++) {
      act(() => {
        tree.root.findByType(CGMGraph).props.onTooltipChange({
          touchTimeMs: (index * DAY) / 61,
          anchorTimeMs: (index * DAY) / 61,
        });
      });
    }
    const measured = {
      glucoseColorEvaluations: colors.mock.calls.length - initialColors,
      loadNormalizations: loads.mock.calls.length - initialLoads,
      pathRenders: paths.mock.calls.length - initialPaths,
    };
    expect(tree.root.findByType(HomeChartsTooltip).props.anchorTimeMs).toBe(
      (60 * DAY) / 61,
    );
    expect(measured).toMatchObject({
      loadNormalizations: 0,
      pathRenders: 0,
    });
    expect(measured.glucoseColorEvaluations).toBeLessThanOrEqual(60);
  });

  it.each(['separate', 'mixed'] as const)(
    'keeps %s insulin geometry stable, and refreshes it for data, size and theme changes',
    chartMode => {
      const paths = jest.spyOn(Path.prototype, 'render');
      const lines = jest.spyOn(Line.prototype, 'render');
      const rectangles = jest.spyOn(Rect.prototype, 'render');
      const chart = (
        updates: Partial<React.ComponentProps<typeof StackedHomeCharts>> = {},
      ) => (
        <StackedHomeCharts
          bgSamples={bgSamples}
          loadSamples={loadSamples}
          foodItems={null}
          insulinData={insulinData}
          basalProfileData={basalProfileData}
          width={390}
          cgmHeight={240}
          miniChartHeight={120}
          xDomain={xDomain}
          showFullScreenButton={false}
          tooltipPlacement="panel"
          chartMode={chartMode}
          {...updates}
        />
      );
      act(() => {
        tree = renderer.create(withTheme(chart()));
      });
      const marks = () => tree.root.findByType(CGMGraph);
      const glucose = () =>
        marks()
          .findAllByType(Circle)
          .filter(node => node.props.fill !== 'none');
      const originalPath = tree.root.findAllByType(Path)[0]!.props.d;
      expect(paths).toHaveBeenCalled();
      expect(
        tree.root.findAllByProps({testID: 'basal-tempBasal-segment'}).length,
      ).toBeGreaterThan(0);
      const initialPathCount = paths.mock.calls.length;
      const initialLineCount = lines.mock.calls.length;
      const initialRectCount = rectangles.mock.calls.length;
      for (let index = 1; index <= 60; index++) {
        act(() => {
          tree.root.findByType(CGMGraph).props.onTooltipChange({
            touchTimeMs: (index * DAY) / 61,
            anchorTimeMs: (index * DAY) / 61,
          });
        });
        expect(tree.root.findByType(HomeChartsTooltip).props.basalRateUhr).toBe(
          getEffectiveBasalRateAt({
            basalProfile: basalProfileData,
            insulinData,
            timeMs: (index * DAY) / 61,
          }),
        );
      }
      expect(paths.mock.calls.length - initialPathCount).toBe(0);
      expect(
        lines.mock.contexts
          .slice(initialLineCount)
          .filter(instance =>
            String(instance.props.testID).startsWith('basal-'),
          ),
      ).toHaveLength(0);
      // Only bars entering or leaving the selection window need native updates.
      expect(
        rectangles.mock.calls.length - initialRectCount,
      ).toBeLessThanOrEqual(120);
      expect(glucose()).toHaveLength(288);
      expect(tree.root.findByType(HomeChartsTooltip).props).toMatchObject({
        activeInsulinU: 1.5,
        cobG: 20,
      });
      const changedTheme = {
        ...getThemeById('calmBlue'),
        inRangeColor: '#123456',
        chart: {...getThemeById('calmBlue').chart, iob: '#987654'},
      };
      act(() => tree.update(withTheme(chart(), changedTheme)));
      expect(glucose()[0]!.props.fill).toBe('#123456');
      expect(paths.mock.calls.length).toBeGreaterThan(initialPathCount);
      const originalX = glucose()[1]!.props.cx;
      act(() => tree.update(withTheme(chart({width: 600}), changedTheme)));
      expect(glucose()[1]!.props.cx).not.toBe(originalX);
      act(() =>
        tree.update(
          withTheme(
            chart({
              width: 600,
              bgSamples: [
                ...bgSamples,
                {
                  ...bgSamples[0]!,
                  date: DAY,
                  dateString: new Date(DAY).toISOString(),
                  sgv: 125,
                },
              ],
              loadSamples: loadSamples.map((sample, index) => ({
                ...sample,
                iob: index === 287 ? 5 : sample.iob,
              })),
            }),
            changedTheme,
          ),
        ),
      );
      expect(glucose()).toHaveLength(289);
      expect(tree.root.findAllByType(Path)[0]!.props.d).not.toBe(originalPath);
      act(() =>
        tree.update(
          withTheme(
            chart({
              insulinData: [],
              basalProfileData: [{time: '00:00', value: 1.25}],
            }),
            changedTheme,
          ),
        ),
      );
      expect(tree.root.findByType(HomeChartsTooltip).props.basalRateUhr).toBe(
        1.25,
      );
    },
  );
});
