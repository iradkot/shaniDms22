import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useStackedChartsTooltipModel} from 'app/containers/MainTabsNavigator/Containers/Home/components/StackedHomeCharts/hooks/useStackedChartsTooltipModel';
import {useCgmGraphTooltipModel} from 'app/components/charts/CgmGraph/hooks/useCgmGraphTooltipModel';
import {createBolusTooltipIndex} from 'app/components/charts/CgmGraph/utils/tooltipEventIndex';
import type {InsulinDataEntry} from 'app/types/insulin.types';
import type {FoodItemDTO} from 'app/types/food.types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const bgSamples: [] = [];
const domain: [Date, Date] = [new Date(0), new Date(DAY)];
const bolusAt = (timeMs: number, amount = 1): InsulinDataEntry => ({
  type: 'bolus',
  amount,
  timestamp: new Date(timeMs).toISOString(),
});
const carbAt = (timestamp: number, id = String(timestamp)): FoodItemDTO => ({
  id,
  timestamp,
  carbs: 5,
  name: 'Fixture',
  image: '',
  notes: '',
  score: 0,
});

type TooltipModel =
  | ReturnType<typeof useStackedChartsTooltipModel>
  | ReturnType<typeof useCgmGraphTooltipModel>;
type Mode = 'stacked' | 'external' | 'internal';
type ProbeProps = {
  mode: Mode;
  cursor: number;
  insulinData: InsulinDataEntry[];
  foodItems: FoodItemDTO[];
  xDomain?: [Date, Date];
  onModel: (value: TooltipModel) => void;
};
function Probe({
  mode,
  cursor,
  insulinData,
  foodItems,
  xDomain = domain,
  onModel,
}: ProbeProps) {
  const input = {bgSamples, insulinData, foodItems};
  const stacked = useStackedChartsTooltipModel({
    ...input,
    chartsTooltip:
      mode === 'stacked' ? {touchTimeMs: cursor, anchorTimeMs: cursor} : null,
    width: 390,
    marginLeft: 50,
    marginRight: 15,
    xDomain,
  });
  const cgm = useCgmGraphTooltipModel({
    ...input,
    tooltipMode: mode === 'external' ? 'external' : 'internal',
    cursorTimeMs: mode === 'external' ? cursor : null,
    isTouchActive: mode === 'internal',
    touchTimeMs: mode === 'internal' ? cursor : null,
  });
  onModel(mode === 'stacked' ? stacked : cgm);
  return null;
}

describe('Chart tooltip source preparation', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  afterEach(() => {
    if (tree) {
      act(() => tree!.unmount());
      tree = undefined;
    }
    jest.restoreAllMocks();
  });

  it.each(['stacked', 'external', 'internal'] as const)(
    '%s cursor moves do not reread distant event timestamps',
    mode => {
      const timestamp = jest.fn(() => new Date(20 * 60 * MINUTE).toISOString());
      const insulinData: InsulinDataEntry[] = [
        {type: 'bolus', amount: 1, timestamp: new Date(0).toISOString()},
        {
          type: 'bolus',
          amount: 2,
          get timestamp() {
            return timestamp();
          },
        },
      ];
      const carbTimestamp = jest.fn(() => 20 * 60 * MINUTE);
      const foodItems: FoodItemDTO[] = [
        {
          ...carbAt(0),
          get timestamp() {
            return carbTimestamp();
          },
        },
      ];
      const Harness = ({cursor}: {cursor: number}) => {
        const input = {bgSamples, foodItems, insulinData};
        const stacked = useStackedChartsTooltipModel({
          ...input,
          chartsTooltip:
            mode === 'stacked'
              ? {touchTimeMs: cursor, anchorTimeMs: cursor}
              : null,
          width: 390,
          marginLeft: 50,
          marginRight: 15,
          xDomain: domain,
        });
        const cgm = useCgmGraphTooltipModel({
          ...input,
          tooltipMode: mode === 'external' ? 'external' : 'internal',
          cursorTimeMs: mode === 'external' ? cursor : null,
          isTouchActive: mode === 'internal',
          touchTimeMs: mode === 'internal' ? cursor : null,
        });
        return (
          <React.Fragment>
            {mode === 'stacked' ? stacked.cgmAnchorTimeMs : cgm.cgmAnchorTimeMs}
          </React.Fragment>
        );
      };
      act(() => {
        tree = renderer.create(<Harness cursor={0} />);
      });
      expect(timestamp).toHaveBeenCalled();
      expect(carbTimestamp).toHaveBeenCalled();
      timestamp.mockClear();
      carbTimestamp.mockClear();
      act(() => tree!.update(<Harness cursor={0} />));
      expect(timestamp).not.toHaveBeenCalled();
      for (let cursor = 1; cursor <= 60; cursor++) {
        act(() => tree!.update(<Harness cursor={cursor * MINUTE} />));
      }
      expect(timestamp).not.toHaveBeenCalled();
      expect(carbTimestamp).not.toHaveBeenCalled();
      expect(tree!.toJSON()).toBe(String(60 * MINUTE));
    },
  );

  it.each(['stacked', 'external'] as const)(
    '%s keeps inclusive time windows, ordering, record identity and its existing limit',
    mode => {
      const cursor = 12 * 60 * MINUTE;
      const radius = (mode === 'stacked' ? 5 : 30) * MINUTE;
      const expectedBoluses = [
        bolusAt(cursor - radius),
        bolusAt(cursor),
        bolusAt(cursor),
        bolusAt(cursor + radius),
      ];
      const expectedCarbs = [
        carbAt(cursor - radius),
        carbAt(cursor, 'same-time-first'),
        carbAt(cursor, 'same-time-second'),
        carbAt(cursor + radius),
      ];
      const insulinData: InsulinDataEntry[] = [
        bolusAt(cursor + radius + 1),
        expectedBoluses[3]!,
        expectedBoluses[0]!,
        expectedBoluses[1]!,
        expectedBoluses[2]!,
        bolusAt(cursor - radius - 1),
        {type: 'bolus', amount: 1, timestamp: 'invalid'},
        bolusAt(cursor, NaN),
        bolusAt(cursor, 0),
      ];
      const foodItems = [
        carbAt(cursor + radius + 1),
        expectedCarbs[3]!,
        expectedCarbs[0]!,
        expectedCarbs[1]!,
        expectedCarbs[2]!,
        carbAt(cursor - radius - 1),
        carbAt(NaN),
        {...carbAt(cursor), carbs: -1},
      ];
      let model!: TooltipModel;
      const onModel = (next: TooltipModel) => {
        model = next;
      };
      const renderProbe = (boluses = insulinData, carbs = foodItems) => (
        <Probe
          mode={mode}
          cursor={cursor}
          insulinData={boluses}
          foodItems={carbs}
          onModel={onModel}
        />
      );
      act(() => {
        tree = renderer.create(renderProbe());
      });
      expect(model.tooltipBolusEvents).toEqual(expectedBoluses);
      expect(model.tooltipCarbEvents).toEqual(expectedCarbs);
      expect(model.tooltipBolusEvents[1]).toBe(expectedBoluses[1]);
      expect(model.tooltipBolusEvents[2]).toBe(expectedBoluses[2]);
      expect(model.tooltipCarbEvents[1]).toBe(expectedCarbs[1]);
      expect(model.tooltipCarbEvents[2]).toBe(expectedCarbs[2]);
      expect(model.cgmAnchorTimeMs).toBe(cursor);

      const manyBoluses = Array.from({length: 8}, () => bolusAt(cursor));
      const manyCarbs = Array.from({length: 8}, (_, index) =>
        carbAt(cursor, String(index)),
      );
      act(() => tree!.update(renderProbe(manyBoluses, manyCarbs)));
      const limit = mode === 'stacked' ? 8 : 5;
      expect(model.tooltipBolusEvents).toEqual(manyBoluses.slice(0, limit));
      expect(model.tooltipCarbEvents).toEqual(manyCarbs.slice(0, limit));
      act(() => tree!.update(renderProbe([], [])));
      expect(model.tooltipBolusEvents).toEqual([]);
      expect(model.tooltipCarbEvents).toEqual([]);
    },
  );

  it('refreshes stacked preparation when the visible domain changes', () => {
    const cursor = 12 * 60 * MINUTE;
    const insulinData = [bolusAt(cursor - MINUTE), bolusAt(cursor + MINUTE)];
    const foodItems = [carbAt(cursor - MINUTE), carbAt(cursor + MINUTE)];
    let model!: TooltipModel;
    const onModel = (next: TooltipModel) => {
      model = next;
    };
    const renderProbe = (xDomain: [Date, Date]) => (
      <Probe
        mode="stacked"
        cursor={cursor}
        insulinData={insulinData}
        foodItems={foodItems}
        xDomain={xDomain}
        onModel={onModel}
      />
    );
    act(() => {
      tree = renderer.create(renderProbe(domain));
    });
    expect(model.tooltipBolusEvents).toHaveLength(2);
    act(() => tree!.update(renderProbe([new Date(cursor), new Date(DAY)])));
    expect(model.tooltipBolusEvents).toEqual([insulinData[1]]);
    expect(model.tooltipCarbEvents).toEqual([foodItems[1]]);
    act(() => tree!.update(renderProbe([new Date(0), new Date(cursor)])));
    expect(model.tooltipBolusEvents).toEqual([insulinData[0]]);
    expect(model.tooltipCarbEvents).toEqual([foodItems[0]]);
  });

  it('keeps internal bolus ties in source order, carb ties chronological and the cursor unsnapped', () => {
    const cursor = 12 * 60 * MINUTE;
    const first = bolusAt(cursor + MINUTE);
    const earlier = bolusAt(cursor - MINUTE);
    const foodItems = [carbAt(cursor + MINUTE), carbAt(cursor - MINUTE)];
    let model!: TooltipModel;
    const onModel = (next: TooltipModel) => {
      model = next;
    };
    const renderProbe = (insulinData: InsulinDataEntry[]) => (
      <Probe
        mode="internal"
        cursor={cursor}
        insulinData={insulinData}
        foodItems={foodItems}
        onModel={onModel}
      />
    );
    act(() => {
      tree = renderer.create(
        renderProbe([first, earlier, bolusAt(cursor + MINUTE)]),
      );
    });
    expect(model.eventsAnchorTimeMs).toBe(cursor + MINUTE);
    expect(model.cgmAnchorTimeMs).toBe(cursor);
    act(() => tree!.update(renderProbe([earlier, first])));
    expect(model.eventsAnchorTimeMs).toBe(cursor - MINUTE);
    act(() => tree!.update(renderProbe([])));
    expect(model.eventsAnchorTimeMs).toBe(cursor - MINUTE);
    expect(model.cgmAnchorTimeMs).toBe(cursor);
  });

  it('ignores a malformed first bolus when finding a valid internal anchor', () => {
    const cursor = 12 * 60 * MINUTE;
    const validBolus = bolusAt(cursor + 4 * MINUTE);
    const insulinData: InsulinDataEntry[] = [
      {type: 'bolus', amount: 1, timestamp: 'not-a-date'},
      validBolus,
    ];
    let model!: TooltipModel;
    act(() => {
      tree = renderer.create(
        <Probe
          mode="internal"
          cursor={cursor}
          insulinData={insulinData}
          foodItems={[carbAt(cursor - MINUTE)]}
          onModel={next => {
            model = next;
          }}
        />,
      );
    });
    expect(model.eventsAnchorTimeMs).toBe(cursor + 4 * MINUTE);
    expect(model.cgmAnchorTimeMs).toBe(cursor);
    expect(model.tooltipBolusEvents).toEqual([validBolus]);
  });
});

describe('Private tooltip index query guards', () => {
  const first = bolusAt(MINUTE);
  const second = bolusAt(2 * MINUTE);
  const index = createBolusTooltipIndex([first, second]);

  it.each([NaN, -1, Infinity, -Infinity])(
    'rejects invalid radius %s',
    radius => {
      expect(index.within(MINUTE, radius)).toEqual([]);
    },
  );

  it.each([NaN, -1, -Infinity, 1.5])('rejects invalid limit %s', limit => {
    expect(index.within(MINUTE, MINUTE, limit)).toEqual([]);
  });

  it('allows exact-time windows, zero matches and the explicit unlimited policy', () => {
    expect(index.within(MINUTE, 0)).toEqual([first]);
    expect(index.within(MINUTE, MINUTE, 0)).toEqual([]);
    expect(index.within(MINUTE, MINUTE, 1)).toEqual([first]);
    expect(index.within(MINUTE, MINUTE, Infinity)).toEqual([first, second]);
  });
});
