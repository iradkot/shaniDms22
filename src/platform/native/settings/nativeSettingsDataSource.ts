import type {
  SettingsAccountStatus,
  SettingsCommand,
  SettingsDataSource,
  SettingsDataSourceRequest,
  SettingsLanguage,
  SettingsNightscoutStatus,
  SettingsOfflineStatus,
  SettingsOverview,
} from '../../../modules/settings';
import {
  SettingsDataSourceError,
  buildSettingsOverview,
} from '../../../modules/settings';
import {
  CORE_DESTINATION_IDS,
  createStoredDestinationTarget,
} from '../../../product/destinations';
import type {
  PersonalizationLayout,
  ProductPersonalizationChange,
  StoredProductPersonalization,
} from '../../../product/personalization';
import {
  selectLayoutProfile,
  updateLayoutProfile,
} from '../../../product/personalization';

export interface NativeSettingsDataSourceInput {
  readonly language: SettingsLanguage;
  readonly layout: PersonalizationLayout;
  readonly personalization: StoredProductPersonalization;
  readonly savePersonalization: (
    change: ProductPersonalizationChange,
  ) => Promise<void>;
  readonly setLanguage: (language: SettingsLanguage) => Promise<void>;
  readonly ai: {
    readonly enabled: boolean;
    readonly credentialConfigured: boolean;
    readonly setEnabled: (enabled: boolean) => void | Promise<void>;
  };
  readonly preMealAssistance: {
    readonly enabled: boolean;
    readonly notificationsEnabled: boolean;
    readonly setSettings: (settings: {
      readonly enabled: boolean;
      readonly notificationsEnabled: boolean;
    }) => void | Promise<void>;
  };
  readonly account: {
    readonly status: SettingsAccountStatus;
    readonly displayLabel?: string;
  };
  readonly nightscout: {
    readonly status: SettingsNightscoutStatus;
    readonly displayLabel?: string;
    readonly credentialConfigured: boolean;
  };
  readonly offline: {
    readonly status: SettingsOfflineStatus;
    readonly pendingWrites: number;
  };
}

const assertActive = (request?: SettingsDataSourceRequest): void => {
  if (request?.signal?.aborted) {
    throw new SettingsDataSourceError('cancelled', 'Settings request cancelled.');
  }
};

const shortcutId = (command: Extract<SettingsCommand, {kind: 'set-shortcut'}>) =>
  command.shortcut === 'chat'
    ? CORE_DESTINATION_IDS.aiAnalyst
    : CORE_DESTINATION_IDS.updateCenter;

const updatePersonalization = (
  current: StoredProductPersonalization,
  layout: PersonalizationLayout,
  command: Extract<
    SettingsCommand,
    {kind: 'set-layout-option' | 'set-shortcut'}
  >,
): StoredProductPersonalization => {
  const profile = selectLayoutProfile(current, layout);
  if (command.kind === 'set-layout-option') {
    const field =
      command.option === 'show-current-snapshot'
        ? 'showCurrentSnapshot'
        : command.option === 'show-recents'
        ? 'showRecents'
        : 'showGri';
    return updateLayoutProfile(current, {...profile, [field]: command.enabled});
  }

  const id = shortcutId(command);
  const withoutTarget = profile.shell.shortcuts.filter(
    target => target.destinationId !== id,
  );
  if (command.enabled && withoutTarget.length >= 2) {
    throw new SettingsDataSourceError(
      'shortcut-limit',
      'Only two Shell shortcuts can be enabled.',
    );
  }
  const shortcuts = command.enabled
    ? [...withoutTarget, createStoredDestinationTarget(id)]
    : withoutTarget;
  return updateLayoutProfile(current, {
    ...profile,
    shell: {...profile.shell, shortcuts},
  });
};

/**
 * Adapts existing providers to Settings without introducing another store.
 * Its interface never accepts credential values; only configured/not-configured
 * status can reach the Product layer.
 */
export const createNativeSettingsDataSource = (
  input: NativeSettingsDataSourceInput,
): SettingsDataSource => {
  let language = input.language;
  let aiEnabled = input.ai.enabled;
  let preMealAssistance = {
    enabled: input.preMealAssistance.enabled,
    notificationsEnabled: input.preMealAssistance.notificationsEnabled,
  };
  let personalization = input.personalization;
  let commandTail: Promise<void> = Promise.resolve();

  const overview = (): SettingsOverview => {
    const profile = selectLayoutProfile(personalization, input.layout);
    return buildSettingsOverview({
      language,
      layout: input.layout,
      personalization: {
        questionnaireStatus: personalization.workspace.questionnaire.status,
        favoritesCount: personalization.account.favorites.length,
        showCurrentSnapshot: profile.showCurrentSnapshot,
        showRecents: profile.showRecents,
        showGri: profile.showGri,
        chatShortcut: profile.shell.shortcuts.some(
          target => target.destinationId === CORE_DESTINATION_IDS.aiAnalyst,
        ),
        updatesShortcut: profile.shell.shortcuts.some(
          target => target.destinationId === CORE_DESTINATION_IDS.updateCenter,
        ),
      },
      account: input.account,
      nightscout: input.nightscout,
      ai: {
        enabled: aiEnabled,
        credentialConfigured: input.ai.credentialConfigured,
      },
      preMealAssistance,
      offline: input.offline,
    });
  };

  const applyNow = async (
    command: SettingsCommand,
    request?: SettingsDataSourceRequest,
  ): Promise<SettingsOverview> => {
    assertActive(request);
    switch (command.kind) {
      case 'set-language':
        await input.setLanguage(command.language);
        assertActive(request);
        language = command.language;
        break;
      case 'set-ai-enabled':
        await input.ai.setEnabled(command.enabled);
        assertActive(request);
        aiEnabled = command.enabled;
        break;
      case 'set-pre-meal-assistance': {
        const next = {
          ...preMealAssistance,
          [command.option === 'card'
            ? 'enabled'
            : 'notificationsEnabled']: command.enabled,
        };
        await input.preMealAssistance.setSettings(next);
        assertActive(request);
        preMealAssistance = next;
        break;
      }
      case 'set-layout-option':
      case 'set-shortcut': {
        // Validate against the adapter's current view before crossing the
        // persistence seam. The functional change below still resolves again
        // against the provider's latest value to avoid lost updates.
        const candidate = updatePersonalization(
          personalization,
          input.layout,
          command,
        );
        let persistedValue: StoredProductPersonalization | undefined;
        const change: ProductPersonalizationChange = current => {
          const next = updatePersonalization(current, input.layout, command);
          persistedValue = next;
          return next;
        };
        await input.savePersonalization(change);
        assertActive(request);
        personalization =
          persistedValue ?? candidate;
        break;
      }
    }
    return overview();
  };

  return {
    async load(request) {
      assertActive(request);
      return overview();
    },
    apply(command, request) {
      const run = commandTail.then(() => applyNow(command, request));
      commandTail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
  };
};
