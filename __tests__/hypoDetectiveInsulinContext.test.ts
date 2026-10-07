import {
  fetchBgDataForDateRangeUncached,
  fetchTreatmentsForDateRangeUncached,
} from 'app/api/apiRequests';
import {buildHypoDetectiveContext} from 'app/services/aiAnalyst/hypoDetectiveContextBuilder';

jest.mock('app/api/apiRequests', () => ({
  fetchBgDataForDateRangeUncached: jest.fn(),
  fetchTreatmentsForDateRangeUncached: jest.fn(),
}));
jest.mock('app/utils/stackedChartsData.utils', () => ({
  enrichBgSamplesWithDeviceStatusForRange: jest.fn(
    async ({bgSamples}) => bgSamples,
  ),
}));
jest.mock('app/platform/native/journal/nativeJournalEngine', () => ({
  nativeJournalEngine: {open: jest.fn()},
}));

const NOW = Date.UTC(2026, 9, 7, 12);
const HOUR = 3_600_000;
const NADIR = NOW - 2 * HOUR;
const fetchBg = jest.mocked(fetchBgDataForDateRangeUncached);
const fetchTreatments = jest.mocked(fetchTreatmentsForDateRangeUncached);
const build = () => buildHypoDetectiveContext({rangeDays: 1, lowThreshold: 55});
const samples = (nadirMs: number) => [
  {date: nadirMs - 5 * 60_000, sgv: 58},
  {date: nadirMs, sgv: 50, iob: 1.2},
  {date: nadirMs + 5 * 60_000, sgv: 80},
];

describe('Hypo Detective recorded insulin evidence', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    fetchBg.mockResolvedValue(samples(NADIR) as never);
    fetchTreatments.mockResolvedValue([]);
  });
  afterEach(() => jest.useRealTimers());

  it('uses the latest actual delivered revision once and ignores a deleted dose', async () => {
    const dose = {
      syncIdentifier: 'dose',
      created_at: new Date(NADIR - 20 * 60_000).toISOString(),
      eventType: 'Correction Bolus',
      insulin: 0.5,
    };
    fetchTreatments.mockResolvedValue([
      {...dose, deliveredUnits: 0.5, srvModified: NADIR - 15 * 60_000},
      {...dose, deliveredUnits: 0.05, srvModified: NADIR - 10 * 60_000},
      {...dose, deliveredUnits: 0.05, srvModified: NADIR - 10 * 60_000},
      {
        _id: 'deleted',
        created_at: dose.created_at,
        eventType: 'Correction Bolus',
        insulin: 99,
        deleted: true,
      },
    ] as never);
    const event = (await build()).contextJson.events[0];
    expect(event.bolusLast1h).toMatchObject({bolusU: 0.05, bolusCount: 1});
    expect(event.iobU).toBe(1.2);
  });

  it.each([
    {
      created_at: new Date(NADIR - 20 * 60_000).toISOString(),
      deliveredUnits: 'invalid',
    },
    {created_at: 'invalid timestamp', deliveredUnits: 2},
  ])(
    'keeps invalid delivery or timing unknown rather than silently dropping it',
    async dose => {
      fetchTreatments.mockResolvedValue([
        {_id: 'invalid', eventType: 'Correction Bolus', insulin: 5, ...dose},
      ] as never);
      expect((await build()).contextJson.events[0].bolusLast1h).toMatchObject({
        bolusU: null,
        bolusCount: null,
      });
    },
  );

  it('reads context and interval carry-in before the earliest event without expanding the analysis range', async () => {
    const startMs = NOW - 24 * HOUR;
    const earlyNadir = startMs + HOUR / 2;
    const doseMs = startMs - HOUR / 4;
    fetchBg.mockResolvedValue(samples(earlyNadir) as never);
    fetchTreatments.mockImplementation(async start =>
      +start <= doseMs
        ? ([
            {
              created_at: new Date(doseMs).toISOString(),
              eventType: 'Bolus',
              insulin: 2,
            },
          ] as never)
        : [],
    );
    const {contextJson} = await build();
    expect(contextJson.range).toMatchObject({startMs, endMs: NOW});
    expect(+fetchTreatments.mock.calls[0]![0]).toBe(startMs - 26 * HOUR);
    expect(contextJson.events[0].bolusLast1h).toMatchObject({
      bolusU: 2,
      bolusCount: 1,
    });
  });
});
