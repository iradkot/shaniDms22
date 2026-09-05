import React from 'react';
import * as d3 from 'd3';
import renderer, {act} from 'react-test-renderer';
import {Circle, Line, Path, Text} from 'react-native-svg';
import {ThemeProvider} from 'styled-components/native';
import {
  GraphStyleContext,
  useGraphStyleContext,
} from 'app/components/charts/CgmGraph/contextStores/GraphStyleContext';
import CGMSamplesRenderer from 'app/components/charts/CgmGraph/components/CGMSamplesRenderer';
import XGridAndAxis from 'app/components/charts/CgmGraph/components/XGridAndAxis';
import XTick from 'app/components/charts/CgmGraph/components/XTick';
import YGridAndAxis from 'app/components/charts/CgmGraph/components/YGridAndAxis';
import {getThemeById} from 'app/style/theme';
import type {BgSample} from 'app/types/day_bgs.types';

const HOUR = 3600000;
const start = Date.UTC(2026, 8, 3, 8, 30);
const sample = (date: number, sgv: number): BgSample => ({
  date,
  dateString: new Date(date).toISOString(),
  sgv,
  trend: 0,
  direction: 'Flat',
  device: 'fixture',
  type: 'sgv',
});
const chartTheme = getThemeById('highContrastRisk');
const contextFor = (bgSamples: BgSample[] = []) => ({
  width: 320,
  height: 240,
  margin: {left: 50, right: 15, top: 20, bottom: 30},
  graphWidth: 255,
  graphHeight: 190,
  xScale: d3.scaleTime<number, number>()
    .domain([new Date(start), new Date(start + 3 * HOUR)])
    .range([0, 255]),
  yScale: d3.scaleLinear<number, number>().domain([0, 300]).range([190, 0]),
  bgSamples,
});

describe('Mobile glucose rendering', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => {
    if (tree) {
      act(() => tree.unmount());
    }
  });

  const render = (
    children: React.ReactNode,
    context = contextFor(),
  ) => {
    act(() => {
      tree = renderer.create(
        <ThemeProvider theme={chartTheme}>
          <GraphStyleContext.Provider value={[context, () => {}]}>
            {children}
          </GraphStyleContext.Provider>
        </ThemeProvider>,
      );
    });
    return tree;
  };

  it('keeps readable glucose values outside the plot instead of over the first samples', () => {
    render(<YGridAndAxis highestBgThreshold={300} />);
    const labels = tree.root.findAllByType(Text);
    expect(labels.length).toBeGreaterThan(0);
    labels.forEach(label => {
      expect(label.props.x).toBe(-8);
      expect(label.props.textAnchor).toBe('end');
      expect(label.props.opacity ?? 1).toBe(1);
      expect(label.props.fill).toBe(chartTheme.textColor);
    });
  });

  it('shows both selected-window boundaries even when natural hour ticks omit them', () => {
    const context = contextFor();
    context.xScale.ticks = () => [1, 2, 3].map(hour =>
      new Date(start + (hour - 0.5) * HOUR),
    );
    render(<XGridAndAxis />, context);
    const positions = tree.root.findAllByType(XTick).map(tick => tick.props.x);
    expect(positions[0]).toBe(0);
    expect(positions[positions.length - 1]).toBe(255);
    positions.slice(1).forEach((position, index) => {
      expect(position - positions[index]).toBeGreaterThanOrEqual(54);
    });
  });

  it('anchors boundary times inside the phone plot and keeps text fully opaque', () => {
    render(<><XTick x={0} withDate /><XTick x={255} withDate /></>);
    const labels = tree.root.findAllByType(Text);
    expect(labels.map(label => label.props.textAnchor)).toEqual(['start', 'end']);
    labels.forEach(label => {
      expect(label.props.opacity ?? 1).toBe(1);
      expect(label.props.fill).toBe(chartTheme.textColor);
    });
  });

  it('uses the chart theme and a small focus ring while preserving missing-sample gaps', () => {
    const first = sample(start, 110);
    render(
      <CGMSamplesRenderer focusedSampleDateString={first.dateString} />,
      contextFor([
        first,
        sample(start + HOUR, 180),
        sample(start + 2 * HOUR, Number.POSITIVE_INFINITY),
      ]),
    );
    const circles = tree.root.findAllByType(Circle);
    const samples = circles.filter(circle => circle.props.fill !== 'none');
    expect(samples).toHaveLength(2);
    expect(samples[0].props.fill).toBe(chartTheme.inRangeColor);
    expect(circles.some(circle => circle.props.fill === 'none')).toBe(true);
    circles.forEach(circle => expect(circle.props.r).toBeLessThanOrEqual(5));
    expect(tree.root.findAllByType(Path)).toHaveLength(0);
    expect(tree.root.findAllByType(Line)).toHaveLength(0);
  });

  it('keeps readings above 300 visible without letting off-screen or invalid samples flatten the chart', () => {
    const readings = [
      sample(start + HOUR, 420),
      sample(start + 2 * HOUR, Number.POSITIVE_INFINITY),
      sample(start + 4 * HOUR, 950),
    ];
    let chart: ReturnType<typeof useGraphStyleContext>[0] | undefined;
    const Probe = () => {
      const context = useGraphStyleContext(
        320,
        240,
        readings,
        [new Date(start), new Date(start + 3 * HOUR)],
      );
      chart = context[0];
      return (
        <GraphStyleContext.Provider value={context}>
          <CGMSamplesRenderer focusedSampleDateString={readings[0].dateString} />
        </GraphStyleContext.Provider>
      );
    };
    render(<Probe />);
    expect(chart!.yScale.domain()[1]).toBe(450);
    const reading = tree.root.findAllByType(Circle)
      .find(circle => circle.props.fill !== 'none' && circle.props.cx === 85);
    expect(reading).toBeDefined();
    expect(reading!.props.cy).toBeGreaterThan(5);
    expect(reading!.props.cy).toBeLessThan(chart!.graphHeight);
  });
});
