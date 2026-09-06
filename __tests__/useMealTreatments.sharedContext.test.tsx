import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {useMealTreatments} from 'app/containers/MainTabsNavigator/Containers/FoodTracker/hooks/useMealTreatments';
import {
  fetchBgDataForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
} from 'app/api/apiRequests';
import {
  loadInsulinContext,
  type InsulinContext,
} from 'app/services/insulin/insulinDataSource';

let mockRevision = 1;
const mockListeners = new Set<() => void>();
jest.mock('app/api/shaniNightscoutInstances', () => ({
  getNightscoutConfigurationRevision: () => mockRevision,
  subscribeNightscoutConfiguration: (listener: () => void) => {
    mockListeners.add(listener);
    return () => mockListeners.delete(listener);
  },
}));
jest.mock('app/api/apiRequests', () => ({
  fetchBgDataForDateRangeUncached: jest.fn(),
  fetchTreatmentsForDateRangeUncached: jest.fn(async () => []),
  fetchDeviceStatusForDateRangeUncached: jest.fn(async () => []),
  getUserProfileFromNightscout: jest.fn(async () => []),
}));
jest.mock('app/services/insulin/insulinDataSource', () => ({
  loadInsulinContext: jest.fn(),
}));
const day = new Date(2026, 8, 1, 12);
const time = +day;
const context = (): InsulinContext => ({
  treatments: [],
  deviceStatus: [],
  profileData: null,
  insulinData: [
    {type: 'bolus', timestamp: day.toISOString(), amount: 1.25},
    {
      type: 'tempBasal',
      timestamp: new Date(time - 60 * 60_000).toISOString(),
      startTime: new Date(time - 60 * 60_000).toISOString(),
      endTime: new Date(time + 60 * 60_000).toISOString(),
      duration: 120,
      rate: 0.4,
    },
  ],
  basalProfileData: [{time: '00:00', timeAsSeconds: 0, value: 0.7}],
  carbTreatments: [
    {
      id: 'meal',
      name: 'Meal',
      timestamp: time,
      carbs: 30,
      image: '',
      notes: '',
      score: 0,
    },
  ],
  loadSamples: [{timestampMs: time, iob: 0, cob: 30}],
  availability: {
    treatments: 'available',
    deviceStatus: 'available',
    profile: 'available',
  },
  freshness: {kind: 'fresh', fetchedAtMs: time},
});

describe('useMealTreatments shared insulin context', () => {
  let current: ReturnType<typeof useMealTreatments>;
  let tree: renderer.ReactTestRenderer;
  const Harness = () => {
    current = useMealTreatments(day, day);
    return null;
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockRevision = 1;
    mockListeners.clear();
    jest.mocked(fetchBgDataForDateRangeUncached).mockResolvedValue([]);
    jest.mocked(loadInsulinContext).mockReset().mockResolvedValue(context());
  });
  afterEach(() => {
    act(() => tree?.unmount());
  });

  it('uses the shared historical range and retains load-only data and basal carry-in around a meal', async () => {
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    expect(loadInsulinContext).toHaveBeenCalledWith({
      startMs: +start,
      endMs: +end,
      forceRefresh: false,
    });
    expect(fetchTreatmentsForDateRangeUncached).not.toHaveBeenCalled();
    expect(current!.meals[0]?.bolusInsulinU).toBe(1.25);
    const chart = current!.getChartDataForMeal(current!.meals[0]!);
    expect(chart.bgSamples).toEqual([]);
    expect(chart.loadSamples).toEqual(context().loadSamples);
    expect(chart.insulinData).toEqual(context().insulinData);
    expect(chart.dataAvailability).toEqual(context().availability);
    await act(async () => {
      await current!.refresh();
    });
    expect(loadInsulinContext).toHaveBeenLastCalledWith({
      startMs: +start,
      endMs: +end,
      forceRefresh: true,
    });
  });

  it('keeps stale facts labelled and does not report a bolus summary as authoritative', async () => {
    const stale = context();
    jest
      .mocked(loadInsulinContext)
      .mockResolvedValue({
        ...stale,
        availability: {...stale.availability, treatments: 'stale'},
      });
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    expect(current!.meals[0]?.bolusInsulinU).toBeNull();
    expect(current!.dataAvailability.treatments).toBe('stale');
  });

  it('clears old-source rows and ignores a late old-source response', async () => {
    let resolveOld!: (value: InsulinContext) => void;
    jest
      .mocked(loadInsulinContext)
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValueOnce({...context(), carbTreatments: []});
    await act(async () => {
      tree = renderer.create(<Harness />);
    });
    await act(async () => {
      mockRevision += 1;
      mockListeners.forEach(listener => listener());
    });
    await act(async () => {
      resolveOld(context());
    });
    expect(current!.meals).toEqual([]);
  });

  it('labels retained chart facts stale when refresh fails and ends loading', async () => {
    await act(async () => {tree = renderer.create(<Harness />);});
    jest.mocked(loadInsulinContext).mockRejectedValueOnce(new Error('private transport detail'));
    await act(async () => {await current!.refresh();});
    expect(current!.isLoading).toBe(false);
    expect(current!.error).toBe('Meal data could not be loaded.');
    expect(current!.meals[0]?.bolusInsulinU).toBeNull();
    const chart = current!.getChartDataForMeal(current!.meals[0]!);
    expect(chart.insulinData).toEqual(context().insulinData);
    expect(chart.dataAvailability?.treatments).toBe('stale');
  });
});
