import React, {useEffect} from 'react';
import renderer, {act} from 'react-test-renderer';

import {useInsulinData} from 'app/hooks/useInsulinData';

jest.mock('app/api/apiRequests', () => ({
  fetchInsulinDataForDateRange: jest.fn(),
  getUserProfileFromNightscout: jest.fn(),
}));

const api = require('app/api/apiRequests') as {
  fetchInsulinDataForDateRange: jest.Mock;
  getUserProfileFromNightscout: jest.Mock;
};

function flushPromises(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

test('useInsulinData refresh re-fetches and updates bolus data', async () => {
  const date = new Date('2026-01-07T12:00:00.000Z');

  api.getUserProfileFromNightscout.mockResolvedValue([
    {
      defaultProfile: 'Default',
      store: {
        Default: {
          basal: [],
        },
      },
    },
  ]);

  // Initial fetch: no bolus.
  api.fetchInsulinDataForDateRange.mockResolvedValueOnce([]);

  let latest:
    | {insulinData: any[]; refresh: () => Promise<void>}
    | undefined;

  const TestComp = () => {
    const {insulinData, getUpdatedInsulinData} = useInsulinData(date);

    useEffect(() => {
      latest = {insulinData, refresh: getUpdatedInsulinData};
    }, [insulinData, getUpdatedInsulinData]);

    return null;
  };

  await act(async () => {
    renderer.create(<TestComp />);
  });

  await act(async () => {
    await flushPromises();
  });

  expect(latest?.insulinData).toEqual([]);

  // Refresh fetch: bolus appears (e.g., 21:30 Israel ~ 19:30Z).
  api.fetchInsulinDataForDateRange.mockResolvedValueOnce([
    {
      type: 'bolus',
      amount: 1.95,
      timestamp: '2026-01-07T19:30:00.000Z',
    },
  ]);

  await act(async () => {
    await latest!.refresh();
    await flushPromises();
  });

  expect(latest?.insulinData).toHaveLength(1);
  expect(latest?.insulinData[0]).toMatchObject({
    type: 'bolus',
    amount: 1.95,
    timestamp: '2026-01-07T19:30:00.000Z',
  });
});
