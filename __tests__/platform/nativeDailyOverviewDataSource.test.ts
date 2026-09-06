import {createNativeDailyOverviewDataSource} from 'app/platform/native/product/nativeDailyOverviewDataSource';
import {
  loadInsulinContext,
  type InsulinContext,
} from 'app/services/insulin/insulinDataSource';

jest.mock('app/services/insulin/insulinDataSource', () => ({
  loadInsulinContext: jest.fn(),
}));
jest.mock('app/api/apiRequests', () => ({
  fetchInsulinDataForDateRange: jest.fn(),
  getUserProfileFromNightscout: jest.fn(),
}));

const period = {startMs: 1_000, endMs: 2_000};

describe('createNativeDailyOverviewDataSource', () => {
  it('uses the shared normalized insulin context in its production path', async () => {
    const context = {
      insulinData: [
        {type: 'bolus', amount: 2, timestamp: new Date(1_500).toISOString()},
      ],
      basalProfileData: [{time: '00:00', value: 0.8}],
      availability: {
        treatments: 'available',
        deviceStatus: 'unavailable',
        profile: 'available',
      },
    } as InsulinContext;
    jest.mocked(loadInsulinContext).mockResolvedValueOnce(context);
    const calculateTotals = jest
      .fn()
      .mockReturnValue({totalBasal: 0.4, totalBolus: 2});
    const source = createNativeDailyOverviewDataSource({
      glucoseDataSource: {loadGlucoseSamples: async () => []},
      calculateTotals,
      useE2EFixtures: false,
    });
    await expect(source.loadDailyOverview(period)).resolves.toMatchObject({
      insulinSummary: {quality: 'available', basalUnits: 0.4, bolusUnits: 2},
    });
    expect(loadInsulinContext).toHaveBeenCalledWith({
      startMs: period.startMs,
      endMs: period.endMs,
    });
    expect(calculateTotals).toHaveBeenCalledWith(
      context.insulinData,
      context.basalProfileData,
      new Date(period.startMs),
      new Date(period.endMs),
    );
  });

  it.each(['stale', 'unavailable'] as const)(
    'does not turn %s treatment history into a zero insulin total',
    async quality => {
      jest.mocked(loadInsulinContext).mockResolvedValueOnce({
        insulinData: [],
        basalProfileData: [{time: '00:00', value: 0.8}],
        availability: {
          treatments: quality,
          deviceStatus: 'available',
          profile: 'available',
        },
      } as InsulinContext);
      const calculateTotals = jest
        .fn()
        .mockReturnValue({totalBasal: 0, totalBolus: 0});
      const source = createNativeDailyOverviewDataSource({
        glucoseDataSource: {loadGlucoseSamples: async () => []},
        calculateTotals,
        useE2EFixtures: false,
      });
      await expect(source.loadDailyOverview(period)).resolves.toMatchObject({
        insulinSummary: {quality: 'unavailable'},
      });
      expect(calculateTotals).not.toHaveBeenCalled();
    },
  );

  it('combines glucose with an authoritative basal and bolus summary', async () => {
    const loadGlucoseSamples = jest
      .fn()
      .mockResolvedValue([{timestampMs: 1_500, valueMgDl: 111}]);
    const fetchInsulinEntries = jest
      .fn()
      .mockResolvedValue([
        {type: 'bolus', amount: 2, timestamp: new Date(1_500).toISOString()},
      ]);
    const fetchProfile = jest.fn().mockResolvedValue([{profile: true}]);
    const extractBasalProfile = jest
      .fn()
      .mockReturnValue([{time: '00:00', value: 0.8}]);
    const calculateTotals = jest
      .fn()
      .mockReturnValue({totalBasal: 0.4, totalBolus: 2});
    const source = createNativeDailyOverviewDataSource({
      glucoseDataSource: {loadGlucoseSamples},
      fetchInsulinEntries,
      fetchProfile,
      extractBasalProfile,
      calculateTotals,
      useE2EFixtures: false,
    });

    await expect(source.loadDailyOverview(period)).resolves.toEqual({
      glucoseSamples: [{timestampMs: 1_500, valueMgDl: 111}],
      insulinSummary: {
        quality: 'available',
        basalUnits: 0.4,
        bolusUnits: 2,
      },
    });
    expect(fetchInsulinEntries).toHaveBeenCalledWith(
      new Date(period.startMs),
      new Date(period.endMs),
    );
    expect(calculateTotals).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      new Date(period.startMs),
      new Date(period.endMs),
    );
  });

  it('marks insulin unavailable when a basal profile is missing instead of inventing zero', async () => {
    const source = createNativeDailyOverviewDataSource({
      glucoseDataSource: {loadGlucoseSamples: async () => []},
      fetchInsulinEntries: async () => [],
      fetchProfile: async () => [],
      extractBasalProfile: () => [],
      calculateTotals: () => ({totalBasal: 0, totalBolus: 0}),
      useE2EFixtures: false,
    });

    await expect(source.loadDailyOverview(period)).resolves.toEqual({
      glucoseSamples: [],
      insulinSummary: {quality: 'unavailable'},
    });
  });

  it('keeps glucose available when the independent insulin request fails', async () => {
    const source = createNativeDailyOverviewDataSource({
      glucoseDataSource: {
        loadGlucoseSamples: async () => [{timestampMs: 1_500, valueMgDl: 123}],
      },
      fetchInsulinEntries: async () => {
        throw new Error('profile source offline');
      },
      fetchProfile: async () => [],
      extractBasalProfile: () => [],
      calculateTotals: () => ({totalBasal: 0, totalBolus: 0}),
      useE2EFixtures: false,
    });

    await expect(source.loadDailyOverview(period)).resolves.toEqual({
      glucoseSamples: [{timestampMs: 1_500, valueMgDl: 123}],
      insulinSummary: {quality: 'unavailable'},
    });
  });
});
