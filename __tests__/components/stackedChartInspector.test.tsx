import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useStackedChartsTooltipModel} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts/hooks/useStackedChartsTooltipModel';
import BolusMiniGraph from 'app/components/charts/BolusMiniGraph/BolusMiniGraph';
import MiniChartLane from 'app/components/charts/MiniChartLane';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import {withTheme} from '../mocks/withTheme';

describe('Chart inspector time consistency', () => {
  const minute = 60000;
  const time = 10 * 60 * minute;
  let tree: renderer.ReactTestRenderer;
  afterEach(() => act(() => tree.unmount()));
  it.each(['start', 'end'] as const)(
    'agrees with the visible dose lane at the %s boundary',
    edge => {
      const xDomain: [Date, Date] = [
        new Date(time),
        new Date(time + 180 * minute),
      ];
      const cursor = +(edge === 'start' ? xDomain[0] : xDomain[1]);
      const inward = edge === 'start' ? 1 : -1;
      const insulinData: InsulinDataEntry[] = [
        {
          type: 'bolus',
          timestamp: new Date(cursor - inward * 2 * minute).toISOString(),
          amount: 2,
        },
        {
          type: 'bolus',
          timestamp: new Date(cursor + inward * minute).toISOString(),
          amount: 1,
        },
        {type: 'bolus', timestamp: new Date(cursor).toISOString(), amount: 3},
      ];
      let model: ReturnType<typeof useStackedChartsTooltipModel>;
      const Harness = () => {
        model = useStackedChartsTooltipModel({
          chartsTooltip: {touchTimeMs: cursor, anchorTimeMs: cursor},
          bgSamples: [],
          foodItems: [],
          insulinData,
          xDomain,
          width: 320,
          marginLeft: 50,
          marginRight: 15,
        });
        return (
          <BolusMiniGraph
            bgSamples={[]}
            insulinData={insulinData}
            xDomain={xDomain}
            width={320}
            height={48}
            compact
            cursorTimeMs={cursor}
          />
        );
      };
      act(() => {
        tree = renderer.create(withTheme(<Harness />));
      });
      expect(tree.root.findByType(MiniChartLane).props.valueText).toBe('4 U');
      expect(
        model!.tooltipBolusEvents.reduce(
          (total, event) => total + event.amount,
          0,
        ),
      ).toBe(4);
      expect(model!.tooltipBolusEvents).toHaveLength(2);
    },
  );

  it('does not present an old glucose sample as a current reading inside a data gap', () => {
    let model: ReturnType<typeof useStackedChartsTooltipModel>;
    const Harness = () => {
      model = useStackedChartsTooltipModel({
        chartsTooltip: {touchTimeMs: time, anchorTimeMs: time},
        bgSamples: [{date: time - 30 * minute, sgv: 105} as any],
        foodItems: [],
        width: 320,
        marginLeft: 50,
        marginRight: 15,
      });
      return null;
    };
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(model!.tooltipBgSample).toBeNull();
    expect(model!.cursorTimeMs).toBe(time);
  });

  it('shows the fallback panel without claiming there is an active touch', () => {
    let model: ReturnType<typeof useStackedChartsTooltipModel>;
    const Harness = () => {
      model = useStackedChartsTooltipModel({
        chartsTooltip: null,
        showFallback: true,
        fallbackAnchorTimeMs: time,
        bgSamples: [],
        foodItems: [],
        width: 320,
        marginLeft: 50,
        marginRight: 15,
      });
      return null;
    };
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(model!.shouldShowTooltip).toBe(true);
    expect(model!.cursorTimeMs).toBeNull();
    expect(model!.tooltipBgSample).toBeNull();
  });
  it('uses the same five-minute dose window as the bolus lane', () => {
    let model: ReturnType<typeof useStackedChartsTooltipModel>;
    const Harness = () => {
      model = useStackedChartsTooltipModel({
        chartsTooltip: {touchTimeMs: time, anchorTimeMs: time},
        bgSamples: [],
        foodItems: [],
        width: 320,
        marginLeft: 50,
        marginRight: 15,
        insulinData: [
          {
            type: 'bolus',
            timestamp: new Date(time + 4 * minute).toISOString(),
            amount: 1,
          },
          {
            type: 'bolus',
            timestamp: new Date(time + 20 * minute).toISOString(),
            amount: 3,
          },
        ],
      });
      return null;
    };
    act(() => {
      tree = renderer.create(<Harness />);
    });
    expect(model!.tooltipBolusEvents.map(event => event.amount)).toEqual([1]);
    expect(model!.cursorTimeMs).toBe(time);
  });
});
