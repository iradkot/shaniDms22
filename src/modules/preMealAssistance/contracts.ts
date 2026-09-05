import type {DayGraphPeriod} from '../dayGraph';

export interface PreMealAssistanceSettings {
  readonly enabled: boolean;
  /** Notification delivery is a separate opt-in. This flag never enables the card. */
  readonly notificationsEnabled: boolean;
}

export type PreMealTrend =
  | 'double-up'
  | 'up'
  | 'forty-five-up'
  | 'flat'
  | 'forty-five-down'
  | 'down'
  | 'double-down';

export interface PreMealAssistanceFacts {
  readonly observedAtMs: number;
  readonly glucoseMgDl?: number;
  readonly trend?: PreMealTrend;
  readonly iobUnits?: number;
  readonly cobGrams?: number;
}

export type PreMealRelevance =
  | {readonly kind: 'inactive'}
  | {
      readonly kind: 'active';
      readonly startedAtMs: number;
      readonly expiresAtMs: number;
    };

export type PreMealSourceState =
  | {readonly kind: 'live'}
  | {readonly kind: 'offline'; readonly reason?: string};

export interface PreMealAssistanceSnapshot {
  readonly relevance: PreMealRelevance;
  readonly sourceState: PreMealSourceState;
  readonly facts?: PreMealAssistanceFacts;
}

export interface PreMealAssistanceLoadRequest {
  readonly nowMs: number;
  readonly period: DayGraphPeriod;
}

/** Host boundary. Relevance must come from an explicit, time-limited user intent. */
export interface PreMealAssistanceDataSource {
  readonly loadContext: (
    request: PreMealAssistanceLoadRequest,
  ) => Promise<PreMealAssistanceSnapshot>;
}

