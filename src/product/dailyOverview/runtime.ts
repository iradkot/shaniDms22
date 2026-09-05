import type {DailyOverviewDataSource} from '../../modules/dailyOverview';
import type {TrendsRangeThresholds} from '../../modules/trends';

/** Host-provided read capabilities for the rebuilt Daily Overview. */
export interface DailyOverviewModuleRuntime {
  readonly dataSource: DailyOverviewDataSource;
  readonly thresholds: TrendsRangeThresholds;
}
