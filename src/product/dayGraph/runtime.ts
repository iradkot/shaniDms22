import type {DayGraphDataSource} from '../../modules/dayGraph';
import type {
  PersonalizationLayout,
  StoredDayGraphPreferences,
} from '../personalization/types';
import type {
  PreMealAssistanceDataSource,
  PreMealAssistanceSettings,
} from '../../modules/preMealAssistance';

export interface PreMealAssistanceRuntime {
  readonly settings: PreMealAssistanceSettings;
  readonly dataSource: PreMealAssistanceDataSource;
  readonly intentActive?: boolean;
  readonly onStartIntent?: () => void | Promise<void>;
  readonly onClearIntent?: () => void | Promise<void>;
  readonly onOpenMeals?: () => void;
  readonly onOpenAi?: () => void;
}

export interface DayGraphChartPreferencesRuntime {
  /** Account + form factor; changing it starts a fresh presentation session. */
  readonly scopeKey: string;
  readonly layout: PersonalizationLayout;
  readonly value: StoredDayGraphPreferences;
  /** Resolves after local persistence, without waiting for a cloud connection. */
  readonly onSave?: (value: StoredDayGraphPreferences) => Promise<void>;
}

/** Host-provided read capability for the rebuilt Day Graph destination. */
export interface DayGraphModuleRuntime {
  readonly dataSource: DayGraphDataSource;
  readonly expectedSampleIntervalMs?: number;
  readonly preMealAssistance?: PreMealAssistanceRuntime;
  readonly chartPreferences?: DayGraphChartPreferencesRuntime;
}
