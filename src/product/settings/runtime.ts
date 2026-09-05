import type {SettingsDataSource} from '../../modules/settings';

export type SettingsLinkedSection =
  | 'account'
  | 'nightscout'
  | 'ai-credentials'
  | 'alerts'
  | 'diagnostics';

/** Capabilities supplied by the platform host to the rebuilt Settings Module. */
export interface SettingsModuleRuntime {
  readonly dataSource: SettingsDataSource;
  readonly onOpenSection?: (section: SettingsLinkedSection) => void;
  readonly nightscoutConnection?: SettingsNightscoutConnectionRuntime;
}

export type SettingsNightscoutFailure =
  | 'authentication'
  | 'not-found'
  | 'timeout'
  | 'network'
  | 'invalid-response'
  | 'unknown';

export type SettingsNightscoutTestResult =
  | {
      readonly status: 'connected';
      readonly entriesCount: number;
      readonly latestEntryDate?: number;
    }
  | {readonly status: 'failed'; readonly reason: SettingsNightscoutFailure};

/** Display-only connection state; credentials remain inside the platform host. */
export interface SettingsNightscoutConnectionRuntime {
  readonly sourceKey: string;
  readonly status:
    | 'not-configured'
    | 'configured'
    | 'loading'
    | 'connected'
    | 'failed';
  readonly latestEntryDate?: number;
  readonly testConnection: () => Promise<SettingsNightscoutTestResult>;
  readonly recovery?: {
    readonly count: number;
    readonly recover: () => Promise<void>;
  };
}
