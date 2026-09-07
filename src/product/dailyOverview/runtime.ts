import type {DailyOverviewDataSource} from '../../modules/dailyOverview';
import type {TrendsRangeThresholds} from '../../modules/trends';
import type {
  PersonalizationLayout,
  StoredDailyOverviewPreferences,
} from '../personalization/types';

export interface DailyOverviewPreferencesRuntime {
  /** Account + form factor; changing it starts a fresh presentation session. */
  readonly scopeKey: string;
  readonly layout: PersonalizationLayout;
  readonly value: StoredDailyOverviewPreferences;
  /** Defaults shown before hydration must not overwrite stored preferences. */
  readonly hydrated?: boolean;
  /** Resolves after local persistence, without waiting for a cloud connection. */
  readonly onSave?: (value: StoredDailyOverviewPreferences) => Promise<void>;
}

/** Host-provided read capabilities for the rebuilt Daily Overview. */
export interface DailyOverviewModuleRuntime {
  readonly dataSource: DailyOverviewDataSource;
  readonly thresholds: TrendsRangeThresholds;
  readonly layoutPreferences?: DailyOverviewPreferencesRuntime;
}
