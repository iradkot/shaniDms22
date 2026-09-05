import {
  CORE_DESTINATION_IDS,
  createStoredDestinationTarget,
} from 'app/product/destinations';
import {
  createDefaultProductPersonalization,
  resolveProductPersonalizationChange,
  selectLayoutProfile,
  updateLayoutProfile,
} from 'app/product/personalization';
import {createNativeSettingsDataSource} from 'app/platform/native/settings';
import type {ProductPersonalizationChange} from 'app/product/personalization';
import {SettingsDataSourceError} from 'app/modules/settings';

const createInput = (
  overrides: Partial<
    Parameters<typeof createNativeSettingsDataSource>[0]
  > = {},
): Parameters<typeof createNativeSettingsDataSource>[0] => ({
  language: 'en',
  layout: 'phone',
  personalization: createDefaultProductPersonalization(),
  savePersonalization: async () => undefined,
  setLanguage: async () => undefined,
  ai: {
    enabled: true,
    credentialConfigured: false,
    setEnabled: () => undefined,
  },
  preMealAssistance: {
    enabled: false,
    notificationsEnabled: false,
    setSettings: () => undefined,
  },
  account: {status: 'signed-in', displayLabel: 'Irad'},
  nightscout: {
    status: 'connected',
    displayLabel: 'Home',
    credentialConfigured: true,
  },
  offline: {status: 'ready', pendingWrites: 0},
  ...overrides,
});

describe('createNativeSettingsDataSource', () => {
  it('updates only the active form-factor profile through existing personalization persistence', async () => {
    let personalization = createDefaultProductPersonalization();
    const savedChanges: ProductPersonalizationChange[] = [];
    const dataSource = createNativeSettingsDataSource({
      language: 'en',
      layout: 'tablet',
      personalization,
      savePersonalization: async change => {
        savedChanges.push(change);
        personalization = resolveProductPersonalizationChange(
          personalization,
          change,
        );
      },
      setLanguage: async () => undefined,
      ai: {
        enabled: true,
        credentialConfigured: false,
        setEnabled: () => undefined,
      },
      preMealAssistance: {
        enabled: false,
        notificationsEnabled: false,
        setSettings: () => undefined,
      },
      account: {status: 'signed-in', displayLabel: 'Irad'},
      nightscout: {
        status: 'connected',
        displayLabel: 'Home',
        credentialConfigured: true,
      },
      offline: {status: 'ready', pendingWrites: 0},
    });

    const result = await dataSource.apply({
      kind: 'set-layout-option',
      option: 'show-current-snapshot',
      enabled: true,
    });

    expect(savedChanges).toHaveLength(1);
    expect(result.personalization.showCurrentSnapshot).toBe(true);
    expect(selectLayoutProfile(personalization, 'tablet').showCurrentSnapshot).toBe(
      true,
    );
    expect(selectLayoutProfile(personalization, 'phone').showCurrentSnapshot).toBe(
      false,
    );
    expect(
      selectLayoutProfile(personalization, 'tablet').shell.shortcuts,
    ).toContainEqual(
      createStoredDestinationTarget(CORE_DESTINATION_IDS.aiAnalyst),
    );
  });

  it('delegates language and AI changes without retaining failed updates', async () => {
    const setLanguage = jest
      .fn<Promise<void>, ['en' | 'he']>()
      .mockRejectedValueOnce(new Error('storage unavailable'))
      .mockResolvedValueOnce(undefined);
    const setEnabled = jest.fn();
    const dataSource = createNativeSettingsDataSource(
      createInput({
        setLanguage,
        ai: {
          enabled: true,
          credentialConfigured: true,
          setEnabled,
        },
      }),
    );

    await expect(
      dataSource.apply({kind: 'set-language', language: 'he'}),
    ).rejects.toThrow('storage unavailable');
    expect((await dataSource.load()).language).toBe('en');

    expect(
      (await dataSource.apply({kind: 'set-language', language: 'he'})).language,
    ).toBe('he');
    const afterAi = await dataSource.apply({
      kind: 'set-ai-enabled',
      enabled: false,
    });
    expect(setEnabled).toHaveBeenCalledWith(false);
    expect(afterAi.ai.enabled).toBe(false);
    expect(afterAi.ai.advisoryOnly).toBe(true);
  });

  it('keeps the existing two-shortcut limit and exposes a typed error', async () => {
    const initial = createDefaultProductPersonalization();
    const phone = selectLayoutProfile(initial, 'phone');
    const withOtherShortcuts = updateLayoutProfile(initial, {
      ...phone,
      shell: {
        schemaVersion: 1,
        shortcuts: [
          createStoredDestinationTarget(CORE_DESTINATION_IDS.dayGraph),
          createStoredDestinationTarget(CORE_DESTINATION_IDS.trends),
        ],
      },
    });
    const savePersonalization = jest.fn(async () => undefined);
    const dataSource = createNativeSettingsDataSource(
      createInput({
        personalization: withOtherShortcuts,
        savePersonalization,
      }),
    );

    await expect(
      dataSource.apply({
        kind: 'set-shortcut',
        shortcut: 'chat',
        enabled: true,
      }),
    ).rejects.toMatchObject<Partial<SettingsDataSourceError>>({
      code: 'shortcut-limit',
    });
    expect(savePersonalization).not.toHaveBeenCalled();
  });

  it('persists the card and notification opt-ins independently', async () => {
    const setSettings = jest.fn();
    const dataSource = createNativeSettingsDataSource(
      createInput({
        preMealAssistance: {
          enabled: false,
          notificationsEnabled: false,
          setSettings,
        },
      }),
    );

    const enabled = await dataSource.apply({
      kind: 'set-pre-meal-assistance',
      option: 'card',
      enabled: true,
    });
    expect(setSettings).toHaveBeenLastCalledWith({
      enabled: true,
      notificationsEnabled: false,
    });
    expect(enabled.preMealAssistance).toEqual({
      enabled: true,
      notificationsEnabled: false,
    });

    const notifications = await dataSource.apply({
      kind: 'set-pre-meal-assistance',
      option: 'notifications',
      enabled: true,
    });
    expect(setSettings).toHaveBeenLastCalledWith({
      enabled: true,
      notificationsEnabled: true,
    });
    expect(notifications.preMealAssistance.notificationsEnabled).toBe(true);
  });

  it('persists optional Chat and Updates shortcuts on the current Layout Profile', async () => {
    let personalization = createDefaultProductPersonalization();
    const savePersonalization = async (change: ProductPersonalizationChange) => {
      personalization = resolveProductPersonalizationChange(
        personalization,
        change,
      );
    };
    const dataSource = createNativeSettingsDataSource(
      createInput({personalization, savePersonalization}),
    );

    const withoutChat = await dataSource.apply({
      kind: 'set-shortcut',
      shortcut: 'chat',
      enabled: false,
    });

    expect(withoutChat.personalization.chatShortcut).toBe(false);
    expect(withoutChat.personalization.updatesShortcut).toBe(true);
    expect(
      selectLayoutProfile(personalization, 'phone').shell.shortcuts.map(
        target => target.destinationId,
      ),
    ).toEqual([CORE_DESTINATION_IDS.updateCenter]);
    expect(
      selectLayoutProfile(personalization, 'tablet').shell.shortcuts.map(
        target => target.destinationId,
      ),
    ).toEqual([
      CORE_DESTINATION_IDS.aiAnalyst,
      CORE_DESTINATION_IDS.updateCenter,
    ]);
  });

  it('honors cancellation without calling persistence', async () => {
    const savePersonalization = jest.fn(async () => undefined);
    const dataSource = createNativeSettingsDataSource(
      createInput({savePersonalization}),
    );
    const controller = new AbortController();
    controller.abort();

    await expect(
      dataSource.apply(
        {
          kind: 'set-layout-option',
          option: 'show-gri',
          enabled: true,
        },
        {signal: controller.signal},
      ),
    ).rejects.toMatchObject<Partial<SettingsDataSourceError>>({
      code: 'cancelled',
    });
    expect(savePersonalization).not.toHaveBeenCalled();
  });
});
