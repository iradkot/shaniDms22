import React from 'react';
import {Modal, Pressable, ScrollView, View} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import {GestureDetector} from 'react-native-gesture-handler';
import {withTheme} from '../../../mocks/withTheme';
import {buildDayGraph} from '../../../../src/modules/dayGraph';
import {RichDayGraphChart} from '../../../../src/product/dayGraph/RichDayGraphChart';
import {ProductPage} from '../../../../src/product/ui/ProductPage';
import {ChartGestureRoot} from '../../../../src/components/charts/interaction/ChartGestureRoot';
import {ChartScrollView} from '../../../../src/components/charts/interaction/ChartScrollView';

const HOUR = 3600000;
const model = buildDayGraph({
  period: {dayStartMs: 0, dayEndMs: 24 * HOUR},
  expectedSampleIntervalMs: 5 * 60000,
  glucoseSamples: [0, 1].map(index => ({
    identity: {sourceId: 'fixture', recordId: `glucose-${index}`},
    timestampMs: 8 * HOUR + index * 5 * 60000,
    valueMgDl: 120,
  })),
  activeLoadSamples: [{timestampMs: 8 * HOUR, iobUnits: 1.5, cobGrams: 30}],
  insulinEvents: [{kind: 'bolus', timestampMs: 8 * HOUR, units: 1.25}],
  basalSchedule: [{secondsFromMidnight: 0, rateUnitsPerHour: 0.75}],
  timelineItems: [],
});

function expectPairedChart(scrollHost: renderer.ReactTestInstance) {
  const detectors = scrollHost.findAllByType(GestureDetector);
  expect(detectors).toHaveLength(3);
  const scrollDetector = detectors[0]!;
  expect(scrollDetector.props.children.type).toBe(ScrollView);
  const scrollGesture = scrollDetector.props.gesture;
  for (const detector of detectors.slice(1)) {
    expect(detector.props.gesture.config.simultaneousWith).toEqual([
      scrollGesture,
    ]);
    expect(detector.props.gesture.config.shouldCancelWhenOutside).toBe(false);
  }
  for (const suffix of ['cgmTouchArea', 'insulinTouchArea']) {
    const surface = scrollHost
      .findAllByType(View)
      .find(node => node.props.testID === `day-graph-rich-chart.${suffix}`)!;
    expect(surface).toBeDefined();
    expect(surface.props.collapsable).toBe(false);
    for (const callback of [
      'onTouchStart',
      'onTouchMove',
      'onTouchEnd',
      'onTouchCancel',
    ]) {
      expect(surface.props[callback]).toBeUndefined();
    }
  }
}

describe('production Day Graph native scroll composition', () => {
  let tree: renderer.ReactTestRenderer;
  afterEach(() => act(() => tree.unmount()));

  function renderPage() {
    act(() => {
      tree = renderer.create(
        withTheme(
          <ChartGestureRoot>
            <ProductPage
              locale="he"
              title="גרף"
              subtitle=""
              testID="day-graph-page">
              <RichDayGraphChart locale="he" model={model} />
            </ProductPage>
          </ChartGestureRoot>,
        ),
      );
    });
  }

  it('pairs both actual chart surfaces with the production page scroll view', () => {
    renderPage();
    expectPairedChart(tree.root.findByType(ChartScrollView));
  });

  it('provides a new gesture root and paired scrolling inside the actual fullscreen modal', () => {
    renderPage();
    const originalScroll = tree.root.findByType(ChartScrollView);
    const originalGesture = originalScroll.findAllByType(GestureDetector)[0]!
      .props.gesture;
    const fullscreen = tree.root
      .findAllByType(Pressable)
      .find(node => node.props.testID === 'chart.cgmGraph.fullscreenButton')!;
    act(() => fullscreen.props.onPress());
    const modal = tree.root.findByType(Modal);
    expect(modal.findAllByType(ChartGestureRoot)).toHaveLength(1);
    const fullscreenScroll = modal.findByType(ChartScrollView);
    expectPairedChart(fullscreenScroll);
    expect(fullscreenScroll.findAllByType(GestureDetector)[0]!.props.gesture)
      .not.toBe(originalGesture);
    const close = modal
      .findAllByType(Pressable)
      .find(node => node.props.testID === 'day-graph-fullscreen-close')!;
    act(() => close.props.onPress());
    expect(tree.root.findAllByType(Modal)).toHaveLength(0);
    expectPairedChart(tree.root.findByType(ChartScrollView));
  });
});
