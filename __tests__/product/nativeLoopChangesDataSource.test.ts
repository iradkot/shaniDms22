import {
  createNativeLoopChangesDataSource,
  projectDetectedLoopChanges,
} from 'app/platform/native/product';
import type {SettingsChangeEvent} from 'app/services/loopAnalysis/settingsChangeDetection';

const event: SettingsChangeEvent = {
  id: 'profile-1',
  timestamp: 2_000,
  profileName: 'Default',
  changeTypes: ['carb_ratio', 'target_low'],
  changes: [
    {
      type: 'carb_ratio',
      label: 'Carb Ratio',
      timeSlot: '08:00',
      oldValue: 10,
      newValue: 9,
      unit: 'g/U',
    },
    {
      type: 'target_low',
      label: 'Target Low',
      timeSlot: null,
      oldValue: 90,
      newValue: 100,
      unit: 'mg/dL',
    },
  ],
  summary: 'Legacy summary',
  enteredBy: 'Loop',
  source: 'user',
  _raw: {apiSecret: 'must-not-leak'} as never,
};

describe('native Loop changes data source', () => {
  it('projects each explicit profile detail with typed values and no raw payload', () => {
    const projected = projectDetectedLoopChanges([event], {
      startMs: 1_000,
      endMs: 3_000,
    });

    expect(projected).toEqual([
      expect.objectContaining({
        id: 'profile-1:0',
        kind: 'carb_ratio',
        summary: 'Carb Ratio · 08:00',
        previousValue: {kind: 'scalar', value: 10, unit: 'g/U'},
        nextValue: {kind: 'scalar', value: 9, unit: 'g/U'},
      }),
      expect.objectContaining({id: 'profile-1:1', kind: 'target'}),
    ]);
    expect(JSON.stringify(projected)).not.toContain('apiSecret');
    expect(JSON.stringify(projected)).not.toContain('enteredBy');
  });

  it('delegates glucose reads and bounds detected history to the requested period', async () => {
    const loadGlucoseSamples = jest.fn(async () => [
      {timestampMs: 1_500, valueMgDl: 110},
    ]);
    const loadDetectedChanges = jest.fn(async () => [
      {...event, timestamp: 500},
      event,
      {...event, id: 'at-end', timestamp: 3_000},
    ]);
    const source = createNativeLoopChangesDataSource({
      glucoseDataSource: {loadGlucoseSamples},
      loadDetectedChanges,
      useE2EFixtures: false,
    });

    await expect(source.loadChanges({startMs: 1_000, endMs: 3_000})).resolves
      .toHaveLength(2);
    await expect(
      source.loadGlucoseSamples({startMs: 1_000, endMs: 3_000}),
    ).resolves.toEqual([{timestampMs: 1_500, valueMgDl: 110}]);
    expect(loadDetectedChanges).toHaveBeenCalledWith({
      beforeTimestamp: 3_000,
      minimumEvents: 250,
    });
  });

  it('keeps source failures distinct from a genuine empty history', async () => {
    const sourceFailure = new Error('Nightscout unavailable');
    const source = createNativeLoopChangesDataSource({
      glucoseDataSource: {loadGlucoseSamples: async () => []},
      loadDetectedChanges: async () => {
        throw sourceFailure;
      },
      useE2EFixtures: false,
    });

    await expect(
      source.loadChanges({startMs: 1_000, endMs: 3_000}),
    ).rejects.toBe(sourceFailure);
  });
});
