import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useStackedChartsTooltipModel} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts/hooks/useStackedChartsTooltipModel';

describe('Chart inspector time consistency', () => {
  const minute = 60000;
  const time = 10 * 60 * minute;
  let tree: renderer.ReactTestRenderer;
  afterEach(() => act(() => tree.unmount()));
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
