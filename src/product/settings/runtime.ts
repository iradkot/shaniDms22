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
}

