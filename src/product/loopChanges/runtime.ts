import type {LoopChangesDataSource} from '../../modules/loopChanges';
import type {TrendsRangeThresholds} from '../../modules/trends';

export interface LoopChangeGraphRequest {
  readonly changeId: string;
  readonly dayStartMs: number;
}

export interface LoopChangeAdvisorRequest {
  readonly changeId: string;
}

/** Host capabilities required by the rebuilt Loop changes Module. */
export interface LoopChangesModuleRuntime {
  readonly dataSource: LoopChangesDataSource;
  readonly thresholds: TrendsRangeThresholds;
  readonly expectedSampleIntervalMs?: number;
  readonly onOpenDayGraph: (request: LoopChangeGraphRequest) => void;
  readonly onAskAiAdvisor: (request: LoopChangeAdvisorRequest) => void;
}
