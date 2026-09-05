import {createNativePreviousDaySummaryDataSource} from 'app/platform/native/product/nativePreviousDaySummaryDataSource';

const period = {startMs: 1_000, endMs: 10_000};

describe('createNativePreviousDaySummaryDataSource', () => {
  it('combines one glucose read with authoritative insulin and stable event references', async () => {
    const loadGlucoseSamples = jest.fn(async () => [
      {timestampMs: 2_000, valueMgDl: 110},
    ]);
    const loadInsulinSummary = jest.fn(async () => ({
      quality: 'available' as const,
      basalUnits: 1.2,
      bolusUnits: 2.3,
    }));
    const loadTimelineItems = jest.fn(async () => [
      {
        kind: 'journal-meal' as const,
        identity: {sourceId: 'journal', recordId: 'meal_1'},
        sourceLabel: 'Journal',
        timestampMs: 3_000,
        title: 'Lunch',
        carbohydratesGrams: 20,
      },
      {
        kind: 'journal-activity' as const,
        identity: {sourceId: 'journal', recordId: 'activity_1'},
        sourceLabel: 'Journal',
        timestampMs: 4_000,
        title: 'Walk',
      },
    ]);
    const source = createNativePreviousDaySummaryDataSource({
      glucoseDataSource: {loadGlucoseSamples},
      loadInsulinSummary,
      loadTimelineItems,
    });

    await expect(source.loadPreviousDaySummary(period)).resolves.toEqual({
      glucoseSamples: [{timestampMs: 2_000, valueMgDl: 110}],
      insulinSummary: {quality: 'available', basalUnits: 1.2, bolusUnits: 2.3},
      events: [
        expect.objectContaining({
          id: 'journal:meal_1',
          kind: 'meal',
          timestampMs: 3_000,
          title: 'Lunch',
        }),
        expect.objectContaining({
          id: 'journal:activity_1',
          kind: 'activity',
          timestampMs: 4_000,
          title: 'Walk',
        }),
      ],
    });
    expect(loadGlucoseSamples).toHaveBeenCalledTimes(1);
    expect(loadInsulinSummary).toHaveBeenCalledWith(
      new Date(period.startMs),
      new Date(period.endMs),
    );
  });

  it('keeps the glucose summary usable when optional event history fails', async () => {
    const source = createNativePreviousDaySummaryDataSource({
      glucoseDataSource: {loadGlucoseSamples: async () => []},
      loadInsulinSummary: async () => ({quality: 'unavailable'}),
      loadTimelineItems: async () => {
        throw new Error('timeline offline');
      },
    });

    await expect(source.loadPreviousDaySummary(period)).resolves.toEqual({
      glucoseSamples: [],
      insulinSummary: {quality: 'unavailable'},
      events: [],
    });
  });
});
