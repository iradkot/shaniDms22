export type SettingsLanguage = 'en' | 'he';

export type SettingsLayout = 'phone' | 'tablet' | 'desktop';

export type SettingsQuestionnaireStatus =
  | 'not-started'
  | 'in-progress'
  | 'completed'
  | 'skipped';

export type SettingsAccountStatus = 'signed-in' | 'signed-out';

export type SettingsNightscoutStatus = 'connected' | 'not-connected';

export type SettingsOfflineStatus =
  | 'ready'
  | 'syncing'
  | 'offline'
  | 'unavailable';

export interface SettingsPersonalizationSummary {
  readonly questionnaireStatus: SettingsQuestionnaireStatus;
  readonly favoritesCount: number;
  readonly showCurrentSnapshot: boolean;
  readonly showRecents: boolean;
  readonly showGri: boolean;
  readonly chatShortcut: boolean;
  readonly updatesShortcut: boolean;
}

export interface SettingsOverviewInput {
  readonly language: SettingsLanguage;
  readonly layout: SettingsLayout;
  readonly personalization: SettingsPersonalizationSummary;
  readonly account: {
    readonly status: SettingsAccountStatus;
    readonly displayLabel?: string;
  };
  readonly nightscout: {
    readonly status: SettingsNightscoutStatus;
    readonly displayLabel?: string;
    readonly credentialConfigured: boolean;
  };
  readonly ai: {
    readonly enabled: boolean;
    readonly credentialConfigured: boolean;
  };
  readonly preMealAssistance: {
    readonly enabled: boolean;
    readonly notificationsEnabled: boolean;
  };
  readonly offline: {
    readonly status: SettingsOfflineStatus;
    readonly pendingWrites: number;
  };
}

export interface SettingsOverview {
  readonly schemaVersion: 1;
  readonly language: SettingsLanguage;
  readonly layout: {
    readonly profile: SettingsLayout;
    readonly columns: 2 | 3;
  };
  readonly personalization: SettingsPersonalizationSummary;
  readonly account: {
    readonly status: SettingsAccountStatus;
    readonly displayLabel?: string;
  };
  readonly nightscout: {
    readonly status: SettingsNightscoutStatus;
    readonly displayLabel?: string;
    readonly credentialConfigured: boolean;
  };
  readonly ai: {
    readonly enabled: boolean;
    readonly credentialConfigured: boolean;
    /** This is an invariant, not a user preference. */
    readonly advisoryOnly: true;
  };
  readonly preMealAssistance: {
    readonly enabled: boolean;
    readonly notificationsEnabled: boolean;
  };
  readonly offline: {
    readonly status: SettingsOfflineStatus;
    readonly pendingWrites: number;
  };
}

export type SettingsLayoutOption =
  | 'show-current-snapshot'
  | 'show-recents'
  | 'show-gri';

export type SettingsShortcut = 'chat' | 'updates';

export type SettingsCommand =
  | {
      readonly kind: 'set-language';
      readonly language: SettingsLanguage;
    }
  | {
      readonly kind: 'set-ai-enabled';
      readonly enabled: boolean;
    }
  | {
      readonly kind: 'set-layout-option';
      readonly option: SettingsLayoutOption;
      readonly enabled: boolean;
    }
  | {
      readonly kind: 'set-shortcut';
      readonly shortcut: SettingsShortcut;
      readonly enabled: boolean;
    }
  | {
      readonly kind: 'set-pre-meal-assistance';
      readonly option: 'card' | 'notifications';
      readonly enabled: boolean;
    };

export interface SettingsDataSourceRequest {
  readonly signal?: AbortSignal;
}

/** The deep Settings seam: read one safe view and apply one typed change. */
export interface SettingsDataSource {
  load(request?: SettingsDataSourceRequest): Promise<SettingsOverview>;
  apply(
    command: SettingsCommand,
    request?: SettingsDataSourceRequest,
  ): Promise<SettingsOverview>;
}

export type SettingsDataSourceErrorCode = 'cancelled' | 'shortcut-limit';

export class SettingsDataSourceError extends Error {
  constructor(readonly code: SettingsDataSourceErrorCode, message: string) {
    super(message);
    this.name = 'SettingsDataSourceError';
  }
}
