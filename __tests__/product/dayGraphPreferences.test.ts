import {
  KeyValueProductPersonalizationStore,
  ProductPersonalizationValidationError,
  createDefaultProductPersonalization,
  customizeProductPersonalization,
  getPersonalizationLayout,
  parseStoredLayoutProfile,
  recordRecentModule,
  selectLayoutProfile,
  updateDayGraphPreferences,
} from 'app/product/personalization';
import {createStoredDestinationTarget} from 'app/product/destinations';

const preferences = {schemaVersion: 1, mode: 'mixed', windowHours: 6} as const;

describe('Day Graph layout preferences', () => {
  it('accepts existing profiles without chart settings and round-trips every allowed view', () => {
    const profile = selectLayoutProfile(
      createDefaultProductPersonalization(),
      'phone',
    );
    expect(parseStoredLayoutProfile(profile)).toEqual(profile);
    for (const mode of ['separate', 'mixed'] as const) {
      for (const windowHours of ['full-day', 3, 6, 12] as const) {
        const dayGraph = {schemaVersion: 1, mode, windowHours};
        expect(
          parseStoredLayoutProfile({...profile, dayGraph}).dayGraph,
        ).toEqual(dayGraph);
      }
    }
  });

  it.each([
    null,
    [],
    {...preferences, schemaVersion: 2},
    {...preferences, mode: 'unknown'},
    {...preferences, mode: undefined},
    {...preferences, windowHours: 0},
    {...preferences, windowHours: 24},
    {...preferences, windowHours: '6'},
    {...preferences, windowHours: Number.NaN},
    {...preferences, atMs: 1234},
    {...preferences, glucose: 120},
    {...preferences, apiKey: 'not-allowed'},
  ])('rejects invalid or non-presentation payloads: %j', dayGraph => {
    const profile = selectLayoutProfile(
      createDefaultProductPersonalization(),
      'phone',
    );
    expect(() => parseStoredLayoutProfile({...profile, dayGraph})).toThrow(
      ProductPersonalizationValidationError,
    );
  });

  it('changes one layout atomically without overwriting recent visits or other profiles', () => {
    const original = createDefaultProductPersonalization();
    const latest = recordRecentModule(
      original,
      createStoredDestinationTarget('core.day-graph'),
      123,
    );
    const next = updateDayGraphPreferences(latest, 'phone', preferences);
    expect(next.account).toEqual(latest.account);
    expect(next.workspace).toEqual(latest.workspace);
    expect(next.device).toEqual(latest.device);
    expect(selectLayoutProfile(next, 'phone')).toEqual({
      ...selectLayoutProfile(latest, 'phone'),
      dayGraph: preferences,
    });
    expect(selectLayoutProfile(next, 'tablet')).toEqual(
      selectLayoutProfile(latest, 'tablet'),
    );
    expect(selectLayoutProfile(next, 'desktop')).toEqual(
      selectLayoutProfile(latest, 'desktop'),
    );
  });

  it('keeps remembered chart defaults when editing the Hub presentation', () => {
    const current = updateDayGraphPreferences(
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
    expect(selectLayoutProfile(next, 'phone').dayGraph).toEqual(preferences);
  });

  it('survives an offline restart without sharing settings with a different account', async () => {
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
    const current = updateDayGraphPreferences(
      createDefaultProductPersonalization(),
      'phone',
      preferences,
    );
    await new KeyValueProductPersonalizationStore(storage).write(
      scope,
      current,
    );
    const reopened = await new KeyValueProductPersonalizationStore(
      storage,
    ).read(scope);
    expect(selectLayoutProfile(reopened, 'phone').dayGraph).toEqual(
      preferences,
    );
    expect(selectLayoutProfile(reopened, 'tablet').dayGraph).toBeUndefined();
    const other = await new KeyValueProductPersonalizationStore(storage).read({
      ...scope,
      productUserId: 'user-2',
    });
    expect(selectLayoutProfile(other, 'phone').dayGraph).toBeUndefined();
  });

  it('keeps a native phone profile when rotating, while Web follows the browser width', () => {
    expect(getPersonalizationLayout('android', 390, 844)).toBe('phone');
    expect(getPersonalizationLayout('android', 844, 390)).toBe('phone');
    expect(getPersonalizationLayout('ios', 1024, 768)).toBe('tablet');
    expect(getPersonalizationLayout('web', 1200, 600)).toBe('desktop');
    expect(getPersonalizationLayout('web', 844, 390)).toBe('tablet');
  });
});
