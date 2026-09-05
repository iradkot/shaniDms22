import {createNativeNightscoutSettingsConnection} from 'app/platform/native/settings';

const input = {
  sourceKey: 'current-owner:source-one',
  profile: {id: 'profile-one', baseUrl: 'https://nightscout.example.test'},
  isLoaded: true,
  snapshot: {snapshot: null, error: null, isLoading: false},
  testProfileConnection: jest.fn(async () => ({
    ok: true as const,
    entriesCount: 0,
    authMethod: 'header' as const,
  })),
};

describe('native Settings Nightscout state', () => {
  it('does not call a saved profile connected until glucose has actually arrived', () => {
    expect(createNativeNightscoutSettingsConnection(input).status).toBe(
      'configured',
    );
    expect(
      createNativeNightscoutSettingsConnection({
        ...input,
        snapshot: {...input.snapshot, isLoading: true},
      }).status,
    ).toBe('loading');
    expect(
      createNativeNightscoutSettingsConnection({
        ...input,
        snapshot: {
          ...input.snapshot,
          snapshot: {enrichedBg: {sgv: 120, date: 1000}},
        },
      }),
    ).toMatchObject({status: 'connected', latestEntryDate: 1000});
    expect(
      createNativeNightscoutSettingsConnection({
        ...input,
        snapshot: {
          ...input.snapshot,
          snapshot: {enrichedBg: {sgv: Number.NaN, date: 1000}},
        },
      }).status,
    ).toBe('configured');
  });

  it('shows failure when refresh fails even if the previous glucose reading is retained', () => {
    const state = createNativeNightscoutSettingsConnection({
      ...input,
      snapshot: {
        snapshot: {enrichedBg: {sgv: 120, date: 1000}},
        isLoading: false,
        error: new Error('private transport details'),
      },
    });
    expect(state).toMatchObject({status: 'failed', latestEntryDate: 1000});
    expect(JSON.stringify(state)).not.toContain('private transport details');
  });

  it('does not expose previous-source data while no source is selected or configured', async () => {
    const state = createNativeNightscoutSettingsConnection({
      ...input,
      profile: null,
      isLoaded: false,
      snapshot: {
        snapshot: {enrichedBg: {sgv: 120, date: 1000}},
        isLoading: true,
        error: null,
      },
    });
    expect(state.status).toBe('not-configured');
    expect(state.latestEntryDate).toBeUndefined();
    expect(await state.testConnection()).toEqual({
      status: 'failed',
      reason: 'unknown',
    });
    expect(input.testProfileConnection).not.toHaveBeenCalled();
  });
});
