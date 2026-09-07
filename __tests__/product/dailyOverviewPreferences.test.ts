import {
  DEFAULT_DAILY_OVERVIEW_PREFERENCES,
  KeyValueProductPersonalizationStore,
  ProductPersonalizationValidationError,
  buildPersonalizationSyncMutation,
  createDefaultProductPersonalization,
  customizeProductPersonalization,
  decodeRemotePersonalizationDocument,
  encodeRemotePersonalizationDocument,
  parseStoredLayoutProfile,
  recordRecentModule,
  selectLayoutProfile,
  updateDailyOverviewPreferences,
  updateDayGraphPreferences,
} from 'app/product/personalization';
import {createStoredDestinationTarget} from 'app/product/destinations';

const preferences = {
  schemaVersion: 1,
  rangeStyle: 'bar',
  cardOrder: ['mean', 'ranges', 'coverage', 'glucose', 'insulin'],
} as const;

describe('Daily Overview layout preferences', () => {
  it('reads previous profiles without migration and round-trips every range presentation', () => {
    const profile = selectLayoutProfile(
      createDefaultProductPersonalization(),
      'phone',
    );
    expect(parseStoredLayoutProfile(profile)).toEqual(profile);
    expect(profile.dailyOverview).toBeUndefined();
    expect(DEFAULT_DAILY_OVERVIEW_PREFERENCES.rangeStyle).toBe('ring');
    for (const rangeStyle of ['ring', 'bar', 'list'] as const) {
      const dailyOverview = {...preferences, rangeStyle};
      expect(
        parseStoredLayoutProfile({...profile, dailyOverview}).dailyOverview,
      ).toEqual(dailyOverview);
    }
  });

  it.each([
    null,
    [],
    {...preferences, schemaVersion: 2},
    {...preferences, rangeStyle: 'unknown'},
    {...preferences, cardOrder: undefined},
    {...preferences, cardOrder: []},
    {...preferences, cardOrder: ['mean', 'ranges', 'glucose', 'insulin']},
    {
      ...preferences,
      cardOrder: ['mean', 'ranges', 'glucose', 'insulin', 'insulin'],
    },
    {
      ...preferences,
      cardOrder: ['mean', 'ranges', 'glucose', 'insulin', 'unknown'],
    },
    {...preferences, cardOrder: [...preferences.cardOrder, 'coverage']},
    {...preferences, dayStartMs: 1234},
    {...preferences, glucose: 120},
    {...preferences, apiKey: 'not-allowed'},
  ])(
    'rejects incomplete, duplicate or non-presentation configuration: %j',
    dailyOverview => {
      const profile = selectLayoutProfile(
        createDefaultProductPersonalization(),
        'phone',
      );
      expect(() =>
        parseStoredLayoutProfile({...profile, dailyOverview}),
      ).toThrow(ProductPersonalizationValidationError);
    },
  );

  it('updates only the selected form factor while retaining graph preferences and new visits', () => {
    const latest = recordRecentModule(
      updateDayGraphPreferences(
        createDefaultProductPersonalization(),
        'phone',
        {
          schemaVersion: 1,
          mode: 'mixed',
          windowHours: 6,
        },
      ),
      createStoredDestinationTarget('core.trends'),
      123,
    );
    const next = updateDailyOverviewPreferences(latest, 'phone', preferences);
    expect(selectLayoutProfile(next, 'phone')).toEqual({
      ...selectLayoutProfile(latest, 'phone'),
      dailyOverview: preferences,
    });
    expect(selectLayoutProfile(next, 'tablet')).toEqual(
      selectLayoutProfile(latest, 'tablet'),
    );
    expect(selectLayoutProfile(next, 'desktop')).toEqual(
      selectLayoutProfile(latest, 'desktop'),
    );
    expect(next.account).toEqual(latest.account);
    expect(next.workspace).toEqual(latest.workspace);
    expect(next.device).toEqual(latest.device);
  });

  it('retains the overview design when saving Hub personalization', () => {
    const current = updateDailyOverviewPreferences(
      createDefaultProductPersonalization(),
      'phone',
      preferences,
    );
    const next = customizeProductPersonalization(current, {
      favorites: current.account.favorites,
      presentation: {
        ...selectLayoutProfile(current, 'phone'),
        showRecents: false,
      },
    });
    expect(selectLayoutProfile(next, 'phone').dailyOverview).toEqual(
      preferences,
    );
  });

  it('survives an offline restart, follows the same account across workspaces, and isolates accounts', async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: async (key: string) => values.get(key) ?? null,
      setItem: async (key: string, value: string) => {
        values.set(key, value);
      },
    };
    const scope = {
      productUserId: 'user-1',
      workspaceId: 'workspace-1',
      layout: 'phone',
    } as const;
    await new KeyValueProductPersonalizationStore(storage).write(
      scope,
      updateDailyOverviewPreferences(
        createDefaultProductPersonalization(),
        'phone',
        preferences,
      ),
    );
    const restarted = new KeyValueProductPersonalizationStore(storage);
    const reopened = await restarted.read(scope);
    expect(selectLayoutProfile(reopened, 'phone').dailyOverview).toEqual(
      preferences,
    );
    expect(
      selectLayoutProfile(reopened, 'tablet').dailyOverview,
    ).toBeUndefined();
    const otherWorkspace = await restarted.read({
      ...scope,
      workspaceId: 'workspace-2',
    });
    expect(selectLayoutProfile(otherWorkspace, 'phone').dailyOverview).toEqual(
      preferences,
    );
    const otherUser = await restarted.read({...scope, productUserId: 'user-2'});
    expect(
      selectLayoutProfile(otherUser, 'phone').dailyOverview,
    ).toBeUndefined();
  });

  it('round-trips the design through the existing remote layout synchronization schema', () => {
    const scope = {
      productUserId: 'user-1',
      workspaceId: 'workspace-1',
      nightscoutSourceId: 'source-1',
      layout: 'phone',
    } as const;
    const mutation = buildPersonalizationSyncMutation({
      scope,
      section: 'layout:phone',
      preferences: updateDailyOverviewPreferences(
        createDefaultProductPersonalization(),
        'phone',
        preferences,
      ),
      savedAt: 10,
      mutationId: 'design_1',
    });
    const snapshot = {...mutation, revision: 1};
    expect(
      decodeRemotePersonalizationDocument(
        encodeRemotePersonalizationDocument(snapshot),
        scope,
        'layout:phone',
      ),
    ).toEqual(snapshot);
  });
});
