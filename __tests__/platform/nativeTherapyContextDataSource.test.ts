import {
  createNativeTherapyContextDataSource,
  classifyExplicitNightscoutAidMode,
  projectNightscoutTherapyContext,
} from 'app/platform/native/product';

const hour = 60 * 60 * 1000;
const start = 1_800_000_000_000;
const period = {startMs: start, endMs: start + 24 * hour};

describe('Nightscout Therapy Context adapters', () => {
  it('accepts explicit mode labels and rejects broad automated wording', () => {
    expect(classifyExplicitNightscoutAidMode({mode: 'closed_loop'})).toBe(
      'closed-loop',
    );
    expect(classifyExplicitNightscoutAidMode({eventType: 'Open Loop'})).toBe(
      'open-loop',
    );
    expect(
      classifyExplicitNightscoutAidMode({notes: 'automatic basal adjustment'}),
    ).toBeUndefined();
  });

  it('does not merge distinct carbohydrate records', () => {
    const projected = projectNightscoutTherapyContext([
      {date: start, carbs: 5},
      {date: start, carbs: 5},
    ]);
    expect(projected.treatments).toHaveLength(2);
  });

  it('combines native glucose and treatment reads into a validated snapshot', async () => {
    const dataSource = createNativeTherapyContextDataSource({
      glucoseDataSource: {
        loadGlucoseSamples: jest.fn(async () =>
          Array.from({length: 288}, (_, index) => ({
            timestampMs: start + index * 5 * 60_000,
            valueMgDl: 120,
          })),
        ),
        loadGlucoseSnapshot: jest.fn(async () => ({
          samples: Array.from({length: 288}, (_, index) => ({
            timestampMs: start + index * 5 * 60_000,
            valueMgDl: 120,
          })),
          freshness: {kind: 'fresh' as const, fetchedAtMs: period.endMs},
        })),
      },
      loadTreatments: jest.fn(async () => ({
        records: [
          {date: start + hour, carbs: 12},
          {
            date: start + 2 * hour,
            eventType: 'Correction Bolus',
            insulin: 1.25,
          },
        ],
        freshness: {kind: 'fresh' as const, fetchedAtMs: period.endMs},
      })),
    });

    const snapshot = await dataSource.loadTherapyContext(period);
    expect(snapshot.quality).toEqual({
      sourceReliability: 'reliable',
      coveragePercent: 100,
    });
    expect(snapshot.totals).toMatchObject({
      insulinUnits: undefined,
      carbohydrateGrams: 12,
    });
    expect(snapshot.insulinSummary).toMatchObject({
      quality: 'partial',
      bolusUnits: 1.25,
    });
  });

  it('uses delivered bolus amounts and does not present a bolus-only sum as total insulin', async () => {
    const dataSource = createNativeTherapyContextDataSource({
      glucoseDataSource: {loadGlucoseSamples: jest.fn(async () => [])},
      loadTreatments: jest.fn(async () => ({
        records: [
          {
            _id: 'interrupted',
            date: start + hour,
            eventType: 'Correction Bolus',
            insulin: 0.5,
            deliveredUnits: 0.05,
          },
        ],
        complete: true,
        freshness: {kind: 'fresh' as const, fetchedAtMs: period.endMs},
      })),
    });
    const snapshot = await dataSource.loadTherapyContext(period);
    expect(snapshot.totals.insulinUnits).toBeUndefined();
    expect(snapshot.insulinSummary).toMatchObject({
      quality: 'partial',
      bolusUnits: 0.05,
      basalCoveragePercent: 0,
    });
  });

  it.each(['stale', 'incomplete'])(
    'rejects %s treatment history before classifying therapy evidence as reliable',
    async failure => {
      const dataSource = createNativeTherapyContextDataSource({
        glucoseDataSource: {loadGlucoseSamples: jest.fn(async () => [])},
        loadTreatments: jest.fn(async () => ({
          records: [{date: start, insulin: 10}],
          complete: failure !== 'incomplete',
          freshness:
            failure === 'stale'
              ? {
                  kind: 'stale' as const,
                  fetchedAtMs: period.endMs,
                  reason: 'network-unavailable' as const,
                }
              : {kind: 'fresh' as const, fetchedAtMs: period.endMs},
        })),
      });
      await expect(dataSource.loadTherapyContext(period)).rejects.toThrow(
        /fresh.*complete/i,
      );
    },
  );

  it('does not classify stale glucose history as reliable therapy evidence', async () => {
    const dataSource = createNativeTherapyContextDataSource({
      glucoseDataSource: {
        loadGlucoseSamples: jest.fn(async () => []),
        loadGlucoseSnapshot: jest.fn(async () => ({
          samples: [],
          freshness: {kind: 'stale' as const, fetchedAtMs: period.endMs},
        })),
      },
      loadTreatments: jest.fn(async () => ({
        records: [],
        complete: true,
        freshness: {kind: 'fresh' as const, fetchedAtMs: period.endMs},
      })),
    });
    expect(
      (await dataSource.loadTherapyContext(period)).quality.sourceReliability,
    ).toBe('unverified');
  });
});
