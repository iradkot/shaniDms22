import {createNativeTrendsDataSource} from 'app/platform/native/product';

describe('native Trends data source', () => {
  it('maps Nightscout readings into the read-only Trends contract', async () => {
    const fetchRange = jest.fn(async () => [
      {date: 1_500, sgv: 123},
      {date: 2_000, sgv: 145},
    ]);
    const dataSource = createNativeTrendsDataSource({
      fetchRange,
      useE2EFixtures: false,
    });

    await expect(
      dataSource.loadGlucoseSamples({startMs: 1_000, endMs: 3_000}),
    ).resolves.toEqual([
      {timestampMs: 1_500, valueMgDl: 123},
      {timestampMs: 2_000, valueMgDl: 145},
    ]);
    expect(fetchRange).toHaveBeenCalledWith(
      new Date(1_000),
      new Date(3_000),
    );
  });

  it('uses deterministic fixtures in E2E without touching Nightscout', async () => {
    const fetchRange = jest.fn(async () => []);
    const fixtureRange = jest.fn(() => [{date: 1_500, sgv: 111}]);
    const dataSource = createNativeTrendsDataSource({
      fetchRange,
      fixtureRange,
      useE2EFixtures: true,
    });

    await expect(
      dataSource.loadGlucoseSamples({startMs: 1_000, endMs: 3_000}),
    ).resolves.toEqual([{timestampMs: 1_500, valueMgDl: 111}]);
    expect(fetchRange).not.toHaveBeenCalled();
    expect(fixtureRange).toHaveBeenCalledWith(
      new Date(1_000),
      new Date(3_000),
    );
  });
});
