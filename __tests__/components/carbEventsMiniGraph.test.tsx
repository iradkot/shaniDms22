import React from 'react';
import {Dimensions, Text} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {Rect} from 'react-native-svg';
import {ThemeProvider} from 'styled-components/native';
import CarbEventsMiniGraph from 'app/components/charts/CarbEventsMiniGraph/CarbEventsMiniGraph';
import MiniChartLane from 'app/components/charts/MiniChartLane';
import {
  buildCarbEvents,
  findClosestCarbEvent,
} from 'app/components/charts/CgmGraph/utils/carbsUtils';
import {getThemeById} from 'app/style/theme';
import type {FoodItemDTO} from 'app/types/food.types';

const MINUTE = 60_000;
const food = (id: string, minute: number, carbs: number): FoodItemDTO => ({
  id,
  timestamp: minute * MINUTE,
  carbs,
  name: id,
  image: '',
  notes: '',
  score: 0,
});
const items = [
  food('ns:meal', 30, 30),
  food('journal:meal', 30, 20),
  food('ns:later', 36, 10),
];
const domain: [Date, Date] = [new Date(0), new Date(60 * MINUTE)];
const theme = getThemeById('highContrastRisk');
const defaultProps = {
  width: 320,
  height: 48,
  compact: true,
  bgSamples: [],
  foodItems: items,
  xDomain: domain,
  locale: 'en' as const,
  testID: 'carb-lane',
  cursorTimeMs: 30 * MINUTE,
};

describe('Recorded carbohydrate event lane', () => {
  let tree: renderer.ReactTestRenderer;
  beforeEach(() => {
    const window = Dimensions.get('window');
    const screen = Dimensions.get('screen');
    jest.spyOn(Dimensions, 'get').mockImplementation(name => ({
      ...(name === 'window' ? window : screen),
      fontScale: 1,
    }));
  });
  afterEach(() => {
    if (tree) {
      act(() => tree.unmount());
    }
    jest.restoreAllMocks();
  });
  const render = (
    updates: Partial<React.ComponentProps<typeof CarbEventsMiniGraph>> = {},
  ) => {
    act(() => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <CarbEventsMiniGraph {...defaultProps} {...updates} />
        </ThemeProvider>,
      );
    });
    return tree.root.findByType(MiniChartLane).props;
  };

  it('retains exact source records and stacks same-time grams on their own scale', () => {
    const lane = render();
    expect(lane.yDomain).toEqual([0, 50]);
    expect(lane.title).toBe('Recorded carbs · g');
    expect(lane.valueText).toBe('50 g');
    const bars = tree.root
      .findAllByType(Rect)
      .filter(node => node.props.testID === 'carb-event-bar');
    expect(bars).toHaveLength(3);
    expect(bars[0].props.x).toBe(bars[1].props.x);
    expect(bars[1].props.y + bars[1].props.height).toBeCloseTo(bars[0].props.y);
    bars.forEach(bar => expect(bar.props.fill).toBe(theme.chart.cob));
  });

  it('uses the five-minute selection window including its boundary, with a distinct empty selection', () => {
    expect(render({cursorTimeMs: 35 * MINUTE}).valueText).toBe('60 g');
    act(() => tree.unmount());
    expect(render({cursorTimeMs: 42 * MINUTE}).valueText).toBe('—');
  });

  it('labels range totals when there is no selected cursor', () => {
    const lane = render({cursorTimeMs: null});
    expect(lane.title).toContain('range total');
    expect(lane.valueText).toBe('60 g');
  });

  it('shows source failure without turning missing events into zero grams', () => {
    const lane = render({foodItems: [], dataStatus: 'unavailable'});
    expect(lane.hasData).toBe(false);
    expect(lane.valueText).toBe('—');
    expect(
      tree.root
        .findAllByType(Text)
        .some(node => node.props.children === 'Could not load this data'),
    ).toBe(true);
  });

  it('uses one validity/range model without proximity deduplication', () => {
    const original = [
      food('outside', -1, 4),
      food('zero', 5, 0),
      food('invalid', 10, Number.NaN),
      ...items,
    ];
    expect(buildCarbEvents(original, domain)).toEqual(items);
    expect(original).toHaveLength(6);
    expect(findClosestCarbEvent(10 * MINUTE, original)?.id).not.toBe('invalid');
    const lane = render({foodItems: original});
    expect(lane.yDomain).toEqual([0, 50]);
    expect(lane.valueText).toBe('50 g');
  });

  it('retains memoized bar geometry while selection changes, then updates theme and data', () => {
    const rectangles = jest.spyOn(Rect.prototype, 'render');
    render();
    const initialRenders = rectangles.mock.calls.length;
    act(() =>
      tree.update(
        <ThemeProvider theme={theme}>
          <CarbEventsMiniGraph {...defaultProps} cursorTimeMs={31 * MINUTE} />
        </ThemeProvider>,
      ),
    );
    // Selection set changes (36 min enters the window), but unchanged events
    // keep their existing native rectangles.
    expect(rectangles.mock.calls.length - initialRenders).toBe(1);
    const alternate = getThemeById('sunsetGlow');
    act(() =>
      tree.update(
        <ThemeProvider theme={alternate}>
          <CarbEventsMiniGraph
            {...defaultProps}
            foodItems={[...items, food('new', 30, 10)]}
          />
        </ThemeProvider>,
      ),
    );
    const lane = tree.root.findByType(MiniChartLane).props;
    expect(lane.valueText).toBe('60 g');
    expect(lane.yDomain).toEqual([0, 60]);
    expect(lane.color).toBe(alternate.chart.cob);
  });
});
