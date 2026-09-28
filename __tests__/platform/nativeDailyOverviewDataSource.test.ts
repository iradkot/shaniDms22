import {createNativeDailyOverviewDataSource} from 'app/platform/native/product/nativeDailyOverviewDataSource';
import {getLocalDayPeriod} from 'app/modules/dailyOverview';
import {createRecordedInsulinDataSource} from 'app/services/insulin/recordedInsulinDataSource';
import {getUserProfileFromNightscout} from 'app/api/apiRequests';

jest.mock('app/api/apiRequests', () => ({
  fetchTreatmentsForDateRangeWithMetadata: jest.fn(),
  getUserProfileFromNightscout: jest.fn(),
}));

const clock = new Date(2026, 8, 28, 10, 30).getTime();
const period = getLocalDayPeriod(clock);
const fresh = (records: Record<string, unknown>[]) => ({
  records,
  freshness: {kind: 'fresh' as const, fetchedAtMs: clock},
});
const setup = (records: Record<string, unknown>[] = []) => {
  const fetchTreatments = jest.fn(async () => fresh(records));
  const recordedDataSource = createRecordedInsulinDataSource({
    fetchTreatments,
    getScopeKey: () => 'account',
    now: () => clock,
  });
  const loadGlucoseSamples = jest.fn(async () => [
    {timestampMs: period.startMs, valueMgDl: 123},
  ]);
  const source = createNativeDailyOverviewDataSource({
    recordedDataSource,
    glucoseDataSource: {loadGlucoseSamples},
    now: () => clock,
    useE2EFixtures: false,
  });
  return {source, fetchTreatments, loadGlucoseSamples};
};

describe('createNativeDailyOverviewDataSource recorded insulin', () => {
  it('keeps a recorded bolus when basal delivery is unknown and never fetches a profile', async () => {
    const {source} = setup([
      {
        eventType: 'Correction Bolus',
        created_at: new Date(period.startMs + 1000).toISOString(),
        insulin: 2,
      },
    ]);
    const result = await source.loadDailyOverview(period);
    expect(result.insulinSummary).toEqual({
      quality: 'partial',
      bolusUnits: 2,
      basalEvidence: 'recorded',
      basalCoveredMs: 0,
      basalCoveragePercent: 0,
    });
    expect(result.glucoseSamples).toHaveLength(1);
    expect(getUserProfileFromNightscout).not.toHaveBeenCalled();
  });
  it('does not turn a generic programmed temp basal into a recorded total', async () => {
    const {source} = setup([
      {
        eventType: 'Temp Basal',
        created_at: new Date(period.startMs).toISOString(),
        duration: 600,
        absolute: 1,
      },
    ]);
    const result = await source.loadDailyOverview(period);
    expect(result.insulinSummary).toMatchObject({
      quality: 'partial',
      bolusUnits: 0,
      basalCoveragePercent: 0,
    });
    expect(result.insulinSummary).not.toHaveProperty('basalUnits');
  });
  it('shares raw history between current data and comparison loading', async () => {
    const {source, fetchTreatments} = setup();
    const [daily, comparison] = await Promise.all([
      source.loadDailyOverview(period, {asOfMs: clock}),
      source.loadDailyInsulinComparison!({period, asOfMs: clock}),
    ]);
    expect(fetchTreatments).toHaveBeenCalledTimes(1);
    expect(daily.insulinSummary).toMatchObject({bolusUnits: 0});
    expect(comparison.weekAverage).toMatchObject({
      quality: 'partial',
      bolusUnits: 0,
    });
    expect(comparison.weekAverage).not.toHaveProperty('totalUnits');
  });
  it('keeps glucose available when treatment history fails', async () => {
    const recordedDataSource = createRecordedInsulinDataSource({
      fetchTreatments: async () => {
        throw new Error('offline');
      },
      getScopeKey: () => 'account',
      now: () => clock,
    });
    const source = createNativeDailyOverviewDataSource({
      recordedDataSource,
      useE2EFixtures: false,
      glucoseDataSource: {
        loadGlucoseSamples: async () => [
          {timestampMs: period.startMs, valueMgDl: 123},
        ],
      },
      now: () => clock,
    });
    expect(await source.loadDailyOverview(period)).toEqual({
      glucoseSamples: [{timestampMs: period.startMs, valueMgDl: 123}],
      insulinSummary: {quality: 'unavailable'},
    });
  });
  it('uses one exclusive current cutoff for insulin and glucose', async () => {
    const loadInsulinSummary = jest.fn(async () => ({
      quality: 'partial' as const,
      bolusUnits: 2,
      basalCoveredMs: 0,
      basalCoveragePercent: 0,
    }));
    const loadGlucoseSamples = jest.fn(async () => []);
    const source = createNativeDailyOverviewDataSource({
      loadInsulinSummary,
      glucoseDataSource: {loadGlucoseSamples},
      now: () => clock,
    });
    await source.loadDailyOverview(period, {asOfMs: clock - 60_000});
    expect(loadInsulinSummary).toHaveBeenCalledWith(
      new Date(period.startMs),
      new Date(clock - 60_000),
    );
    expect(loadGlucoseSamples).toHaveBeenCalledWith({
      ...period,
      endMs: clock - 60_000,
    });
  });
  it('keeps explicitly injected independent history failures unknown with bounded concurrency', async () => {
    let active = 0;
    let maximum = 0;
    const loadInsulinSummary = jest.fn(async (start: Date, end: Date) => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      expect(end.getHours()).toBe(10);
      expect(end.getMinutes()).toBe(30);
      if (start.getDate() === 24) {throw new Error('unavailable');}
      return {
        quality: 'partial' as const,
        bolusUnits: 2,
        basalCoveredMs: 0,
        basalCoveragePercent: 0,
      };
    });
    const source = createNativeDailyOverviewDataSource({
      loadInsulinSummary,
      glucoseDataSource: {loadGlucoseSamples: async () => []},
    });
    const result = await source.loadDailyInsulinComparison!({
      period,
      asOfMs: clock,
    });
    expect(loadInsulinSummary).toHaveBeenCalledTimes(7);
    expect(maximum).toBe(2);
    expect(result).toMatchObject({
      status: 'available',
      yesterday: {quality: 'partial', bolusUnits: 2},
      weekDays: 6,
    });
    expect(result.weekAverage).toBeUndefined();
  });
});
