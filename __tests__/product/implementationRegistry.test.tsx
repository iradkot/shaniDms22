import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {
  ProductImplementationRegistry,
  coreProductImplementationRegistry,
} from '../../src/product/app';
import {
  CORE_DESTINATION_IDS,
  CORE_DESTINATIONS,
  coreDestinationRegistry,
  createStoredDestinationTarget,
  resolveDestinationTarget,
} from '../../src/product/destinations';

describe('Product Implementation Registry', () => {
  it('contains the rebuilt core implementations', () => {
    expect(
      CORE_DESTINATIONS.every(destination =>
        coreProductImplementationRegistry.has(destination.implementationKey),
      ),
    ).toBe(true);
  });

  it('opens a typed period request from the real Trends overview', async () => {
    const destination = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.trendsOverview),
      undefined,
      {platform: 'ios'},
    );
    if (destination.status !== 'available') {
      throw new Error('Expected Trends Overview to be available.');
    }
    const onOpenDestinationRequest = jest.fn();
    const rendered = coreProductImplementationRegistry.render({
      destination,
      request: {destination},
      locale: 'en',
      runtime: {platform: 'ios'},
      trendsRuntime: {
        dataSource: {
          loadGlucoseSamples: async period => [
            {timestampMs: period.startMs, valueMgDl: 50},
          ],
        },
        thresholds: {
          veryLowMaxMgDl: 54,
          targetMinMgDl: 70,
          targetMaxMgDl: 180,
          highMaxMgDl: 250,
        },
      },
      onOpenDestination: () => undefined,
      onOpenDestinationRequest,
      renderJournalUnavailable: () => null,
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<>{rendered}</>);
    });

    const investigate = tree!.root
      .findAllByProps({testID: 'trends-open-hypo-investigation'})
      .find(node => node.type === Pressable);
    act(() => investigate?.props.onPress());

    expect(onOpenDestinationRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: expect.objectContaining({
          destination: expect.objectContaining({
            id: CORE_DESTINATION_IDS.hypoInvestigation,
          }),
        }),
        focus: expect.objectContaining({kind: 'period'}),
      }),
    );
    act(() => tree!.unmount());
  });

  it('shows the AGP plot through the Android daily-patterns destination', async () => {
    const destination = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(
        CORE_DESTINATION_IDS.trendsAgpDailyPatterns,
      ),
      undefined,
      {platform: 'android'},
    );
    if (destination.status !== 'available') {
      throw new Error('Expected AGP and Daily Patterns to be available.');
    }
    const rendered = coreProductImplementationRegistry.render({
      destination,
      request: {destination},
      locale: 'he',
      runtime: {platform: 'android'},
      trendsRuntime: {
        dataSource: {
          loadGlucoseSamples: async period =>
            Array.from({length: 24}, (_, hour) => ({
              timestampMs: period.startMs + hour * 60 * 60 * 1000,
              valueMgDl: 100 + hour * 2,
            })),
        },
        thresholds: {
          veryLowMaxMgDl: 54,
          targetMinMgDl: 80,
          targetMaxMgDl: 160,
          highMaxMgDl: 250,
        },
      },
      onOpenDestination: () => undefined,
      onOpenDestinationRequest: () => undefined,
      renderJournalUnavailable: () => null,
    });
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(<>{rendered}</>);
    });
    const chart = tree!.root.findByProps({testID: 'agp-profile-chart'});
    expect(chart.findByType(Svg)).toBeTruthy();
    expect(
      chart.findAllByType(Path).some(path => /M.*L/.test(path.props.d)),
    ).toBe(true);
    act(() => tree!.unmount());
  });

  it('rejects malformed and duplicate registrations', () => {
    const render = () => <Text>test</Text>;
    expect(
      () =>
        new ProductImplementationRegistry([
          {implementationKey: 'bad key', render},
        ]),
    ).toThrow('Invalid Product implementation key');
    expect(
      () =>
        new ProductImplementationRegistry([
          {implementationKey: 'TestModule', render},
          {implementationKey: 'TestModule', render},
        ]),
    ).toThrow('Duplicate Product implementation');
  });

  it('returns undefined when the host should use its migration bridge', () => {
    const registry = new ProductImplementationRegistry([]);
    const destination = resolveDestinationTarget(
      coreDestinationRegistry,
      createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph),
      undefined,
      {platform: 'ios'},
    );
    if (destination.status !== 'available') {
      throw new Error('Expected Day Graph to be available.');
    }

    expect(
      registry.render({
        destination,
        request: {destination},
        locale: 'en',
        runtime: {platform: 'ios'},
        onOpenDestination: () => undefined,
        onOpenDestinationRequest: () => undefined,
        renderJournalUnavailable: () => null,
      }),
    ).toBeUndefined();
  });
});
