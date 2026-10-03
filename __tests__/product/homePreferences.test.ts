import {
  DEFAULT_DAILY_OVERVIEW_PREFERENCES,
  DEFAULT_HOME_PREFERENCES,
  HOME_WIDGET_IDS,
  KeyValueProductPersonalizationStore,
  ProductPersonalizationValidationError,
  buildPersonalizationSyncMutation,
  createDefaultProductPersonalization,
  decodeRemotePersonalizationDocument,
  encodeRemotePersonalizationDocument,
  parseStoredLayoutProfile,
  recordRecentModule,
  selectLayoutProfile,
  updateDailyOverviewPreferences,
  updateDayGraphPreferences,
  updateHomePreferences,
  type StoredHomePreferences,
} from 'app/product/personalization';
import {createStoredDestinationTarget} from 'app/product/destinations';

const design: StoredHomePreferences = {
  schemaVersion: 1,
  mode: 'personal',
  widgetOrder: [
    'chat',
    'daily-insulin',
    'weekly-insulin',
    'glucose-graph',
    'time-in-range',
    'weekly-glucose',
  ],
  hiddenWidgets: ['time-in-range'],
  glucoseWindowHours: 12,
};

describe('Home layout preferences', () => {
  it('keeps old profiles unchanged and accepts both Home modes, every window and hidden subset', () => {
    const profile = selectLayoutProfile(
      createDefaultProductPersonalization(),
      'phone',
    );
    expect(parseStoredLayoutProfile(profile)).toEqual(profile);
    expect(profile.home).toBeUndefined();
    expect(DEFAULT_HOME_PREFERENCES).toEqual({
      schemaVersion: 1,
      mode: 'personal',
      widgetOrder: HOME_WIDGET_IDS,
      hiddenWidgets: ['time-in-range', 'weekly-insulin'],
      glucoseWindowHours: 6,
    });
    for (const mode of ['personal', 'modules'] as const) {
      for (const glucoseWindowHours of [6, 12, 'full-day'] as const) {
        for (const hiddenWidgets of [[], ['chat'], HOME_WIDGET_IDS]) {
          const home = {...design, mode, glucoseWindowHours, hiddenWidgets};
          expect(parseStoredLayoutProfile({...profile, home}).home).toEqual(home);
        }
      }
    }
  });

  it.each([
    null,
    [],
    {...design, schemaVersion: 2},
    {...design, mode: 'unknown'},
    {...design, mode: undefined},
    {...design, widgetOrder: undefined},
    {...design, widgetOrder: []},
    {...design, widgetOrder: HOME_WIDGET_IDS.slice(1)},
    {...design, widgetOrder: [...HOME_WIDGET_IDS.slice(1), 'chat']},
    {...design, widgetOrder: [...HOME_WIDGET_IDS.slice(1), 'unknown']},
    {...design, widgetOrder: [...HOME_WIDGET_IDS, 'chat']},
    {...design, hiddenWidgets: undefined},
    {...design, hiddenWidgets: null},
    {...design, hiddenWidgets: 'chat'},
    {...design, hiddenWidgets: ['chat', 'chat']},
    {...design, hiddenWidgets: ['unknown']},
    {...design, hiddenWidgets: [null]},
    {...design, glucoseWindowHours: undefined},
    {...design, glucoseWindowHours: 3},
    {...design, glucoseWindowHours: 24},
    {...design, glucoseWindowHours: '6'},
    {...design, dayStartMs: 1234},
    {...design, glucose: 120},
    {...design, chat: {message: 'private'}},
    {...design, apiKey: 'not-allowed'},
  ])('rejects malformed or non-presentation Home values: %j', home => {
    const profile = selectLayoutProfile(
      createDefaultProductPersonalization(),
      'phone',
    );
    expect(() => parseStoredLayoutProfile({...profile, home})).toThrow(
      ProductPersonalizationValidationError,
    );
  });

  it('merges a Home change into only the active layout and preserves later edits and visits', () => {
    const latest = recordRecentModule(
      updateDailyOverviewPreferences(
        updateDayGraphPreferences(
          createDefaultProductPersonalization(),
          'phone',
          {schemaVersion: 1, mode: 'mixed', windowHours: 6},
        ),
        'phone',
        DEFAULT_DAILY_OVERVIEW_PREFERENCES,
      ),
      createStoredDestinationTarget('core.trends'),
      123,
    );
    const next = updateHomePreferences(latest, 'phone', design);
    expect(selectLayoutProfile(next, 'phone')).toEqual({
      ...selectLayoutProfile(latest, 'phone'),
      home: design,
    });
    for (const layout of ['tablet', 'desktop'] as const) {
      expect(selectLayoutProfile(next, layout)).toEqual(
        selectLayoutProfile(latest, layout),
      );
    }
    expect(next.account).toEqual(latest.account);
    expect(next.workspace).toEqual(latest.workspace);
    expect(next.device).toEqual(latest.device);
  });

  it('survives an offline restart across workspaces while isolating accounts and layouts', async () => {
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
      updateHomePreferences(createDefaultProductPersonalization(), 'phone', design),
    );
    const restarted = new KeyValueProductPersonalizationStore(storage);
    const reopened = await restarted.read(scope);
    expect(selectLayoutProfile(reopened, 'phone').home).toEqual(design);
    expect(selectLayoutProfile(reopened, 'tablet').home).toBeUndefined();
    expect(selectLayoutProfile(reopened, 'desktop').home).toBeUndefined();
    const otherWorkspace = await restarted.read({
      ...scope,
      workspaceId: 'workspace-2',
    });
    expect(selectLayoutProfile(otherWorkspace, 'phone').home).toEqual(design);
    const otherAccount = await restarted.read({...scope, productUserId: 'user-2'});
    expect(selectLayoutProfile(otherAccount, 'phone').home).toBeUndefined();
  });

  it('round-trips Home through each existing remote layout document', () => {
    for (const layout of ['phone', 'tablet', 'desktop'] as const) {
      const scope = {
        productUserId: 'user-1',
        workspaceId: 'workspace-1',
        nightscoutSourceId: 'source-1',
        layout,
      };
      const mutation = buildPersonalizationSyncMutation({
        scope,
        section: `layout:${layout}`,
        preferences: updateHomePreferences(
          createDefaultProductPersonalization(),
          layout,
          design,
        ),
        savedAt: 10,
        mutationId: 'home_1',
      });
      const snapshot = {...mutation, revision: 1};
      expect(
        decodeRemotePersonalizationDocument(
          encodeRemotePersonalizationDocument(snapshot),
          scope,
          `layout:${layout}`,
        ),
      ).toEqual(snapshot);
    }
  });
});
