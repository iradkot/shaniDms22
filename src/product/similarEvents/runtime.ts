import type {
  ObservedGlucoseEvent,
  SimilarEventsDataSource,
  SimilarEventsThresholds,
} from '../../modules/similarEvents';

/** Host capabilities for the rebuilt, factual Similar Events destination. */
export interface SimilarEventsModuleRuntime {
  readonly dataSource: SimilarEventsDataSource;
  readonly thresholds: SimilarEventsThresholds;
  readonly expectedSampleIntervalMs?: number;
  readonly eventGapMs?: number;
  readonly historyDurationMs?: number;
  readonly historyChunkDurationMs?: number;
  readonly timeZoneOffsetMinutes?: number;
  readonly onOpenDayGraph: (event: ObservedGlucoseEvent) => void;
  readonly onAskAi: (event: ObservedGlucoseEvent) => void;
}
