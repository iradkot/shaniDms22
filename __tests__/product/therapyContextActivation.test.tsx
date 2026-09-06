import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable} from 'react-native';
import {
  buildTherapyContextSnapshot,
  type TherapyContextDataSource,
  type TherapyContextSnapshot,
  type TrendsPeriod,
} from 'app/modules/trends';
import {CORE_DESTINATION_IDS} from 'app/product/destinations';
import {TrendsLandingView} from 'app/product/trends';

const DAY_MS = 86_400_000;
const runtime = {platform: 'android'} as const;
const now = () => 100 * DAY_MS;
const snapshot = (period: TrendsPeriod): TherapyContextSnapshot =>
  buildTherapyContextSnapshot({
    period,
    glucoseSamples: Array.from({length: 14 * 288}, (_, index) => ({
      timestampMs: period.startMs + index * 300_000,
      valueMgDl: 110,
    })),
    sourceReliability: 'reliable',
    treatments: [],
    mealStartedAtMs: [],
    activities: [],
    modeChanges: [],
  });
const hasTherapyDestination = (tree: renderer.ReactTestRenderer) =>
  tree.root
    .findAllByType(Pressable)
    .some(
      node =>
        node.props.testID ===
        `trends-destination-${CORE_DESTINATION_IDS.trendsTherapyContext}`,
    );

describe('Trends activates its own optional Therapy Context evidence', () => {
  it('loads and validates the secondary destination only when Trends is mounted', async () => {
    const loadTherapyContext = jest.fn(async (period: TrendsPeriod) =>
      snapshot(period),
    );
    const dataSource = {loadTherapyContext};
    expect(loadTherapyContext).not.toHaveBeenCalled();
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TrendsLandingView
          locale="en"
          runtime={runtime}
          now={now}
          onOpenDestination={jest.fn()}
          therapyContext={{dataSource}}
        />,
      );
    });
    expect(loadTherapyContext).toHaveBeenCalledTimes(1);
    expect(loadTherapyContext).toHaveBeenCalledWith({
      startMs: 86 * DAY_MS,
      endMs: 100 * DAY_MS,
    });
    expect(hasTherapyDestination(tree!)).toBe(true);
    act(() => tree!.unmount());
  });

  it('ignores a late previous source response after a Workspace switch', async () => {
    const pending: Array<(value: TherapyContextSnapshot) => void> = [];
    const makeSource = (): TherapyContextDataSource => ({
      loadTherapyContext: () => new Promise(resolve => pending.push(resolve)),
    });
    const first = makeSource();
    const second = makeSource();
    let tree: renderer.ReactTestRenderer;
    const render = (dataSource: TherapyContextDataSource) => (
      <TrendsLandingView
        locale="en"
        runtime={runtime}
        now={now}
        onOpenDestination={jest.fn()}
        therapyContext={{dataSource}}
      />
    );
    act(() => {
      tree = renderer.create(render(first));
    });
    act(() => tree!.update(render(second)));
    const result = snapshot({startMs: 86 * DAY_MS, endMs: 100 * DAY_MS});
    await act(async () => pending[0]!(result));
    expect(hasTherapyDestination(tree!)).toBe(false);
    await act(async () =>
      pending[1]!({
        ...result,
        quality: {sourceReliability: 'reliable', coveragePercent: 20},
        evidence: {
          ...result.evidence,
          coveragePercent: 20,
          coverageQuality: 'low',
        },
      }),
    );
    expect(hasTherapyDestination(tree!)).toBe(false);
    act(() => tree!.unmount());
  });

  it('keeps optional evidence hidden after an unavailable source response', async () => {
    const loadTherapyContext = jest.fn(async () => {
      throw new Error('offline');
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <TrendsLandingView
          locale="en"
          runtime={runtime}
          now={now}
          onOpenDestination={jest.fn()}
          therapyContext={{dataSource: {loadTherapyContext}}}
        />,
      );
    });
    expect(loadTherapyContext).toHaveBeenCalledTimes(1);
    expect(hasTherapyDestination(tree!)).toBe(false);
    act(() => tree!.unmount());
  });
});
