import type {SettingsAppInfo, SettingsOverview, SettingsOverviewInput} from './types';

const safeCount = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const optionalLabel = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, 120) : undefined;
};

const appInfo = (input: SettingsAppInfo | undefined): SettingsAppInfo | undefined => {
  if (!input) {
    return undefined;
  }
  const versionName = optionalLabel(input.versionName);
  const buildNumber = optionalLabel(input.buildNumber);
  const revision = optionalLabel(input.revision);
  const parsedDate = input.builtAt ? Date.parse(input.builtAt) : Number.NaN;
  return {
    ...(versionName ? {versionName} : {}),
    ...(buildNumber ? {buildNumber} : {}),
    ...(revision ? {revision} : {}),
    ...(Number.isFinite(parsedDate) ? {builtAt: new Date(parsedDate).toISOString()} : {}),
  };
};

/**
 * Builds the only data shape that the Settings presentation can observe.
 *
 * The input is deliberately copied field-by-field. Extra runtime fields such
 * as user IDs, Nightscout secrets, and LLM keys can never cross this seam.
 */
export const buildSettingsOverview = (
  input: SettingsOverviewInput,
): SettingsOverview => {
  const accountLabel = optionalLabel(input.account.displayLabel);
  const nightscoutLabel = optionalLabel(input.nightscout.displayLabel);
  const version = appInfo(input.appInfo);
  return {
    schemaVersion: 1,
    ...(version === undefined ? {} : {appInfo: version}),
    language: input.language,
    layout: {
      profile: input.layout,
      columns: input.layout === 'phone' ? 2 : 3,
    },
    personalization: {
      questionnaireStatus: input.personalization.questionnaireStatus,
      favoritesCount: safeCount(input.personalization.favoritesCount),
      showCurrentSnapshot: input.personalization.showCurrentSnapshot,
      showRecents: input.personalization.showRecents,
      showGri: input.personalization.showGri,
      chatShortcut: input.personalization.chatShortcut,
      updatesShortcut: input.personalization.updatesShortcut,
    },
    account: {
      status: input.account.status,
      ...(accountLabel === undefined ? {} : {displayLabel: accountLabel}),
    },
    nightscout: {
      status: input.nightscout.status,
      ...(nightscoutLabel === undefined
        ? {}
        : {displayLabel: nightscoutLabel}),
      credentialConfigured: input.nightscout.credentialConfigured,
    },
    ai: {
      enabled: input.ai.enabled,
      credentialConfigured: input.ai.credentialConfigured,
      advisoryOnly: true,
    },
    preMealAssistance: {
      enabled: input.preMealAssistance.enabled,
      notificationsEnabled: input.preMealAssistance.notificationsEnabled,
    },
    offline: {
      status: input.offline.status,
      pendingWrites: safeCount(input.offline.pendingWrites),
    },
  };
};
