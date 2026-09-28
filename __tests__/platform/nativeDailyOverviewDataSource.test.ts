import {createNativeDailyOverviewDataSource} from 'app/platform/native/product/nativeDailyOverviewDataSource';
import {getLocalDayPeriod} from 'app/modules/dailyOverview';
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
        basalEstimated: true,
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

  it('never includes future scheduled basal when loading today', async () => {
    const now = new Date(2026, 8, 28, 10, 30).getTime();
    const day = getLocalDayPeriod(now);
    const loadInsulinSummary = jest.fn(async () => ({
      quality: 'available' as const,
      basalUnits: 10.5,
      bolusUnits: 2,
    }));
    const loadGlucoseSamples = jest.fn(async () => []);
    const source = createNativeDailyOverviewDataSource({
      glucoseDataSource: {loadGlucoseSamples},
      loadInsulinSummary,
      now: () => now,
    });
    await source.loadDailyOverview(day);
    expect(loadInsulinSummary).toHaveBeenCalledWith(
      new Date(day.startMs),
      new Date(now),
    );
    expect(loadGlucoseSamples).toHaveBeenCalledWith({
      startMs: day.startMs,
      endMs: now,
    });
    await source.loadDailyOverview(day, {asOfMs: now - 60_000});
    expect(loadInsulinSummary).toHaveBeenLastCalledWith(
      new Date(day.startMs),
      new Date(now - 60_000),
    );
  });

  it('loads seven independent same-clock histories with bounded concurrency and preserves failures', async () => {
    const now = new Date(2026, 8, 28, 10, 30).getTime();
    let active = 0;
    let maximum = 0;
    const loadInsulinSummary = jest.fn(async (start: Date, end: Date) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      expect(end.getHours()).toBe(10);
      expect(end.getMinutes()).toBe(30);
      if (start.getDate() === 24) {
        throw new Error('History unavailable');
      }
      return {quality: 'available' as const, basalUnits: 10, bolusUnits: 2};
    });
    const source = createNativeDailyOverviewDataSource({
      glucoseDataSource: {loadGlucoseSamples: async () => []},
      loadInsulinSummary,
    });
    const result = await source.loadDailyInsulinComparison!({
      period: getLocalDayPeriod(now),
      asOfMs: now,
    });
    expect(loadInsulinSummary).toHaveBeenCalledTimes(7);
    expect(maximum).toBe(2);
    expect(result).toMatchObject({
      status: 'available',
      yesterday: {totalUnits: 12},
      weekDays: 6,
    });
    expect(result.weekAverage).toBeUndefined();
  });
});
