import React from 'react';
import * as d3 from 'd3';
import renderer, {act} from 'react-test-renderer';
import {Circle, Text} from 'react-native-svg';
import {ThemeProvider} from 'styled-components/native';
import {GraphStyleContext} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import FoodItemsRenderer from 'app/components/charts/CgmGraph/components/Food/FoodItemsRenderer';
import {buildCarbEvents} from 'app/components/charts/CgmGraph/utils/carbsUtils';
import {getThemeById} from 'app/style/theme';
import type {FoodItemDTO} from 'app/types/food.types';

const MINUTE = 60_000;
const start = Date.UTC(2026, 8, 7, 6);
const food = (id: string, timestamp: number, carbs = 20): FoodItemDTO => ({
  id,
  timestamp,
  carbs,
  name: id,
  image: '',
  notes: '',
  score: 0,
});
const context = {
  width: 320,
  height: 120,
  margin: {left: 50, right: 15, top: 8, bottom: 24},
  graphWidth: 255,
  graphHeight: 88,
  bgSamples: [],
  xScale: d3
    .scaleTime<number, number>()
    .domain([new Date(start), new Date(start + 180 * MINUTE)])
    .range([0, 255]),
  yScale: d3.scaleLinear<number, number>().domain([0, 300]).range([88, 0]),
};

describe('Meal markers in the compact glucose plot', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => {
    if (tree) {
      act(() => tree.unmount());
    }
  });
  const render = (items: FoodItemDTO[], focusedFoodItemIds?: string[]) => {
    act(() => {
      tree = renderer.create(
        <ThemeProvider theme={getThemeById('highContrastRisk')}>
          <GraphStyleContext.Provider value={[context, () => {}]}>
            <FoodItemsRenderer
              foodItems={items}
              focusedFoodItemIds={focusedFoodItemIds}
            />
          </GraphStyleContext.Provider>
        </ThemeProvider>,
      );
    });
    return tree.root.findAllByType(Circle);
  };

  it('excludes meals outside the selected time range before collision placement', () => {
    const circles = render([
      food('outside', start - MINUTE),
      food('inside', start + MINUTE),
    ]);
    expect(circles).toHaveLength(1);
    expect(circles[0].props.cy).toBe(context.graphHeight - 8);
  });

  it('keeps coincident records inside the plot without losing individual records', () => {
    const items = Array.from({length: 8}, (_, index) =>
      food(`same-time-${index}`, start + 60 * MINUTE),
    );
    const circles = render(items, ['same-time-7']);
    expect(circles).toHaveLength(1);
    expect(
      tree.root.findAllByType(Text).map(node => node.props.children),
    ).toEqual([8]);
    expect(buildCarbEvents(items)).toEqual(items);
    expect(circles[0].props.opacity).toBe(1);
    circles.forEach(circle => {
      expect(circle.props.cy).toBeGreaterThanOrEqual(circle.props.r);
      expect(circle.props.cy + circle.props.r).toBeLessThanOrEqual(
        context.graphHeight,
      );
    });
  });

  it('keeps first/last event focus rings inside both plot boundaries', () => {
    const circles = render(
      [food('first', start), food('last', start + 180 * MINUTE)],
      ['first', 'last'],
    );
    circles.forEach(circle => {
      expect(circle.props.cx - circle.props.r).toBeGreaterThanOrEqual(0);
      expect(circle.props.cx + circle.props.r).toBeLessThanOrEqual(
        context.graphWidth,
      );
    });
  });

  it('does not draw carbohydrate markers for zero or invalid carbohydrate values', () => {
    const circles = render([
      food('valid', start + 20 * MINUTE),
      food('zero', start + 40 * MINUTE, 0),
      food('invalid', start + 60 * MINUTE, Number.NaN),
    ]);
    expect(circles).toHaveLength(1);
  });
});
