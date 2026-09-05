import type {
  PreviousDaySummaryDataSource,
  PreviousDaySummaryEvent,
} from '../../modules/previousDaySummary';
import type {TrendsRangeThresholds} from '../../modules/trends';

/** Host-provided read capabilities for the rebuilt Previous Day Summary. */
export interface PreviousDaySummaryModuleRuntime {
  readonly dataSource: PreviousDaySummaryDataSource;
  readonly thresholds: TrendsRangeThresholds;
  readonly expectedSampleIntervalMs?: number;
  readonly onOpenEvent?: (event: PreviousDaySummaryEvent) => void;
}
