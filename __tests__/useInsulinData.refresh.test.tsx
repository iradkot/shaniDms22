import React, {useEffect} from 'react';
import renderer, {act} from 'react-test-renderer';
import {useInsulinData} from 'app/hooks/useInsulinData';
import {
  clearNightscoutInstance,
  configureNightscoutInstance,
} from 'app/api/shaniNightscoutInstances';
import {
  loadInsulinContext,
  type InsulinContext,
} from 'app/services/insulin/insulinDataSource';

jest.mock('app/services/insulin/insulinDataSource', () => ({
  loadInsulinContext: jest.fn(),
}));
const loadContext = jest.mocked(loadInsulinContext);
const date = new Date('2026-01-07T12:00:00.000Z');
const contextWithBolus = (amount?: number): InsulinContext => ({
  treatments: [],
  deviceStatus: [],
  profileData: null,
  insulinData:
    amount === undefined
      ? []
      : [{type: 'bolus', amount, timestamp: date.toISOString()}],
  basalProfileData: [{time: '00:00', value: 1}],
  carbTreatments: [],
  loadSamples: [{timestampMs: date.getTime(), iob: 1.2, cob: 18}],
  availability: {
    treatments: 'available',
    profile: 'available',
    deviceStatus: 'available',
  },
  freshness: {kind: 'fresh', fetchedAtMs: date.getTime()},
});
let latest: ReturnType<typeof useInsulinData>;
let tree: renderer.ReactTestRenderer | undefined;
function Probe() {
  const value = useInsulinData(date);
  useEffect(() => {
    latest = value;
  }, [value]);
  return null;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => {
    resolve = finish;
  });
  return {promise, resolve};
}
beforeEach(() => {
  loadContext.mockReset();
  configureNightscoutInstance({
    baseUrl: 'https://fixture.example',
    ownerUserId: 'owner-a',
  });
});
afterEach(async () => {
  await act(async () => {
    tree?.unmount();
  });
  tree = undefined;
  clearNightscoutInstance();
});

test('refresh updates all insulin context from the shared source and bypasses its completed cache', async () => {
  loadContext.mockResolvedValueOnce(contextWithBolus());
  await act(async () => {
    tree = renderer.create(<Probe />);
  });
  expect(latest.insulinData).toEqual([]);
  expect(latest.loadSamples[0]).toMatchObject({iob: 1.2, cob: 18});
  loadContext.mockResolvedValueOnce(contextWithBolus(1.95));
  await act(async () => {
    await latest.getUpdatedInsulinData();
  });
  expect(latest.insulinData).toEqual([
    expect.objectContaining({type: 'bolus', amount: 1.95}),
  ]);
  expect(latest.basalProfileData).toEqual([{time: '00:00', value: 1}]);
  expect(loadContext).toHaveBeenLastCalledWith(
    expect.objectContaining({forceRefresh: true}),
  );
  expect(latest.error).toBeNull();
});

test('an old owner response cannot replace the newly selected owner insulin context', async () => {
  const oldOwner = deferred<InsulinContext>();
  const nextOwner = deferred<InsulinContext>();
  loadContext
    .mockReturnValueOnce(oldOwner.promise)
    .mockReturnValueOnce(nextOwner.promise);
  await act(async () => {
    tree = renderer.create(<Probe />);
  });
  await act(async () => {
    configureNightscoutInstance({
      baseUrl: 'https://fixture.example',
      ownerUserId: 'owner-b',
    });
  });
  expect(latest.insulinData).toEqual([]);
  await act(async () => {
    nextOwner.resolve(contextWithBolus(2));
  });
  expect(latest.insulinData[0].amount).toBe(2);
  await act(async () => {
    oldOwner.resolve(contextWithBolus(7));
  });
  expect(latest.insulinData[0].amount).toBe(2);
  expect(latest.isLoading).toBe(false);
});

test('available empty insulin and unavailable insulin remain distinguishable', async () => {
  loadContext.mockResolvedValueOnce(contextWithBolus());
  await act(async () => {
    tree = renderer.create(<Probe />);
  });
  expect(latest.availability.treatments).toBe('available');
  expect(latest.error).toBeNull();
  const unavailable = contextWithBolus();
  loadContext.mockResolvedValueOnce({
    ...unavailable,
    availability: {...unavailable.availability, treatments: 'unavailable'},
  });
  await act(async () => {
    await latest.getUpdatedInsulinData();
  });
  expect(latest.insulinData).toEqual([]);
  expect(latest.availability.treatments).toBe('unavailable');
  expect(latest.error).not.toBeNull();
});
