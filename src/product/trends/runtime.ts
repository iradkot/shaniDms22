import type {
  TherapyContextDataSource,
  TherapyContextQualityGateInput,
  TrendsDataSource,
  TrendsRangeThresholds,
} from '../../modules/trends';

/** Host-provided read capabilities for rebuilt Trends views. */
export interface TrendsModuleRuntime {
  readonly dataSource: TrendsDataSource;
  readonly thresholds: TrendsRangeThresholds;
  readonly showGri?: boolean;
  readonly therapyContext?: {
    readonly dataSource: TherapyContextDataSource;
    /** Lightweight source evidence used to hide the secondary destination. */
    readonly quality: TherapyContextQualityGateInput;
  };
}
