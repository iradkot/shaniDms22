import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {ThemeProvider} from 'styled-components/native';
import * as RN from 'react-native';

import FullScreenViewScreen from 'app/containers/FullScreen/FullScreenViewScreen';
import {theme} from 'app/style/theme';

describe('FullScreenViewScreen stackedCharts mode', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  beforeAll(() => {
    jest
      .spyOn(RN, 'useWindowDimensions')
      .mockReturnValue({width: 360, height: 720, scale: 1, fontScale: 1});
  });

  it('renders stacked charts without crashing', async () => {
    const now = Date.UTC(2026, 0, 7, 12, 0, 0);

    const bgSamples = [
      {
        sgv: 110,
        date: now - 5 * 60_000,
        dateString: new Date(now - 5 * 60_000).toISOString(),
        trend: 0,
        direction: 'Flat',
        device: 'mock',
        type: 'sgv',
        iob: 1.2,
        cob: 15,
      },
      {
        sgv: 112,
        date: now,
        dateString: new Date(now).toISOString(),
        trend: 0,
        direction: 'Flat',
        device: 'mock',
        type: 'sgv',
        iob: 1.1,
        cob: 14,
      },
    ];

    const foodItems = [
      {
        id: 'food-1',
        carbs: 25,
        name: 'Carbs',
        image: '',
        notes: '',
        score: 0,
        timestamp: now - 10 * 60_000,
      },
    ];

    const insulinData = [
      {
        type: 'bolus',
        amount: 1.0,
        timestamp: new Date(now - 8 * 60_000).toISOString(),
      },
      {
        type: 'tempBasal',
        rate: 0.9,
        duration: 30,
        startTime: new Date(now - 20 * 60_000).toISOString(),
        endTime: new Date(now + 10 * 60_000).toISOString(),
        timestamp: new Date(now - 20 * 60_000).toISOString(),
      },
    ];

    const basalProfileData = [
      {time: '00:00', value: 0.8, timeAsSeconds: 0},
      {time: '12:00', value: 1.0, timeAsSeconds: 12 * 3600},
    ];

    const navigation = {
      canGoBack: () => true,
      goBack: jest.fn(),
      getParent: () => null,
      navigate: jest.fn(),
    };

    const route = {
      params: {
        mode: 'stackedCharts',
        bgSamples,
        foodItems,
        insulinData,
        basalProfileData,
        xDomainMs: {startMs: now - 60 * 60_000, endMs: now + 60 * 60_000},
        fallbackAnchorTimeMs: now,
      },
    };

    let tree: renderer.ReactTestRenderer;

    await act(async () => {
      tree = renderer.create(
        <ThemeProvider theme={theme}>
          <FullScreenViewScreen navigation={navigation} route={route} />
        </ThemeProvider>,
      );
    });

    expect(tree!.toJSON()).toBeTruthy();

    await act(async () => {
      tree!.unmount();
    });
  });
});
