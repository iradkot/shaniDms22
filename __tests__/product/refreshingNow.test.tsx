import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import {
  PRODUCT_CLOCK_REFRESH_INTERVAL_MS,
  useRefreshingNow,
} from '../../src/product/time';

describe('refreshing product clock', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('refreshes active age-based views and stops after unmount', () => {
    let current = 1_000;
    const now = () => current;
    const Probe = () => <Text>{useRefreshingNow({now})}</Text>;
    let renderer: TestRenderer.ReactTestRenderer;

    act(() => {
      renderer = TestRenderer.create(<Probe />);
    });
    expect(renderer!.root.findByType(Text).props.children).toBe(1_000);

    current = 61_000;
    act(() => {
      jest.advanceTimersByTime(PRODUCT_CLOCK_REFRESH_INTERVAL_MS);
    });
    expect(renderer!.root.findByType(Text).props.children).toBe(61_000);

    act(() => renderer!.unmount());
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not schedule work for an inactive view', () => {
    const Probe = () => <Text>{useRefreshingNow({active: false})}</Text>;
    let renderer: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(<Probe />);
    });
    expect(jest.getTimerCount()).toBe(0);
    act(() => renderer!.unmount());
  });
});
