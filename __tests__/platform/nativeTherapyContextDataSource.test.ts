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
    expect(
      classifyExplicitNightscoutAidMode({eventType: 'Open Loop'}),
    ).toBe('open-loop');
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
      },
      loadTreatments: jest.fn(async () => ({
        records: [
          {date: start + hour, carbs: 12},
          {date: start + 2 * hour, insulin: 1.25},
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
      insulinUnits: 1.25,
      carbohydrateGrams: 12,
    });
  });
});

