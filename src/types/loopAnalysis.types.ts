/**
 * Loop Settings Impact Analysis Types
 *
 * Defines the data contracts for analyzing the clinical impact of
 * Loop/pump settings changes. These types are consumed by:
 * - UI components (LoopTuner tab)
 * - Service layer (analysis engine)
 * - LLM tools (AI Analyst integration)
 */

// =============================================================================
// PROFILE CHANGE EVENT TYPES
// =============================================================================

/**
 * Source system that detected the profile change.
 */
export type LoopSystemSource = 'loop-ios' | 'androidaps' | 'openaps' | 'unknown';

/**
 * Normalized representation of a profile/settings change event.
 * This is the canonical shape regardless of source system.
 */
export interface ProfileChangeEvent {
  /** Unique identifier (derived from timestamp + source). */
  id: string;

  /** When the change was detected (ms since epoch). */
  timestamp: number;

  /** Source system that reported the change. */
  source: LoopSystemSource;

  /** Raw event type from Nightscout (e.g., "Profile Switch", "Note"). */
  eventType: string;

  /** Profile name if available (e.g., "High Activity", "Default"). */
  profileName?: string;

  /** Human-readable summary of what changed. */
  summary: string;

  /** Duration in minutes if this is a temporary profile (0 = permanent). */
  durationMinutes?: number;

  /** Raw Nightscout treatment object for debugging. */
  _raw?: unknown;
}

/**
 * Filter criteria for querying profile change history.
 */
export interface ProfileHistoryFilter {
  /** Start of the date range (ms). */
  startMs?: number;
  /** End of the date range (ms). */
  endMs?: number;
  /** Filter by source system. */
  source?: LoopSystemSource;
  /** Maximum number of events to return. */
  limit?: number;
  /** Exclude temporary profiles (duration > 0). */
  excludeTemporary?: boolean;
}

// =============================================================================
// PERIOD STATISTICS
// =============================================================================

/**
 * Time in Range percentages breakdown.
 * All values are 0-100 scale.
 */
export interface TimeInRangeBreakdown {
  /** Percentage of time with glucose <= veryLowMax (typically 54 mg/dL). */
  veryLow: number;
  /** Percentage of time with glucose > veryLowMax and < targetMin. */
  low: number;
  /** Percentage of time with glucose >= targetMin and <= targetMax. */
  target: number;
  /** Percentage of time with glucose > targetMax and <= highMax. */
  high: number;
  /** Percentage of time with glucose > highMax. */
  veryHigh: number;
}

/**
 * TIR threshold configuration.
 */
export interface TirThresholds {
  /** Values <= this are classified as very/severe low (default: 54). */
  veryLowMax: number;
  /** In-range lower bound inclusive (default: 70). */
  targetMin: number;
  /** In-range upper bound inclusive (default: 180). */
  targetMax: number;
  /** Values <= this are classified as high, above as very high (default: 250). */
  highMax: number;
}

/**
 * Aggregated glucose statistics for a time period.
 */
export interface PeriodStats {
  /** Start of the period (ms). */
  startMs: number;
  /** End of the period (ms). */
  endMs: number;

  /** Number of valid CGM readings in the period. */
  sampleCount: number;

  /** Mean glucose (mg/dL). Null if no samples. */
  averageBg: number | null;

  /** Standard deviation of glucose (mg/dL). Null if < 2 samples. */
  stdDev: number | null;

  /** Coefficient of variation (stdDev / mean * 100). Null if not calculable. */
  cv: number | null;

  /** Time in Range percentages. */
  timeInRange: TimeInRangeBreakdown;

  /** Count of distinct hypoglycemic events (< targetMin). */
  hypoEventCount: number;

  /** Count of distinct hyperglycemic events (> targetMax). */
  hyperEventCount: number;

  /** Average total daily insulin (units) if available. */
  totalInsulinDailyAverage: number | null;

  /** GMI (Glucose Management Indicator) estimated A1c. Null if not calculable. */
  gmi: number | null;
}

/**
 * Hourly glucose aggregate for pattern visualization.
 */
export interface HourlyAggregate {
  /** Hour of day (0-23). */
  hour: number;
  /** Mean glucose for this hour (mg/dL). */
  meanBg: number;
  /** 10th percentile glucose. */
  p10: number;
  /** 25th percentile glucose. */
  p25: number;
  /** Median glucose (50th percentile). */
  median: number;
  /** 75th percentile glucose. */
  p75: number;
  /** 90th percentile glucose. */
  p90: number;
  /** Sample count for this hour. */
  count: number;
}

// =============================================================================
// IMPACT ANALYSIS RESULT
// =============================================================================

/**
 * Delta metrics comparing two periods.
 */
export interface ImpactDeltas {
  /** TIR target percentage difference (post - pre). Positive = improvement. */
  tirDelta: number;

  /** Average BG difference (post - pre). Negative = improvement. */
  avgBgDelta: number | null;

  /** CV difference (post - pre). Negative = less variable. */
  cvDelta: number | null;

  /** Hypo event count difference (post - pre). */
  hypoCountDelta: number;

  /** Hyper event count difference (post - pre). */
  hyperCountDelta: number;

  /**
   * Whether the change is statistically meaningful.
   * Heuristic: |tirDelta| >= 3 OR |avgBgDelta| >= 10.
   */
  isSignificant: boolean;

  /**
   * Overall direction of change.
   * - 'improved': Better TIR and/or lower avg BG without more hypos.
   * - 'worsened': Worse TIR or higher avg BG or more hypos.
   * - 'mixed': Some metrics improved, others worsened.
   * - 'neutral': No significant change.
   */
  overallTrend: 'improved' | 'worsened' | 'mixed' | 'neutral';
}

/**
 * Data quality assessment for the analysis.
 */
export interface DataQualityAssessment {
  /** Percentage of expected readings present in pre-period (0-1). */
  prePeriodCoverage: number;
  /** Percentage of expected readings present in post-period (0-1). */
  postPeriodCoverage: number;
  /** True if both periods have >= 70% coverage. */
  hasEnoughData: boolean;
  /** Number of gaps > 2 hours in pre-period. */
  preGapCount: number;
  /** Number of gaps > 2 hours in post-period. */
  postGapCount: number;
  /** Human-readable quality warnings. */
  warnings: string[];
}

/**
 * Complete analysis result for a settings change.
 * This is the contract consumed by both UI and LLM tools.
 */
export interface ImpactAnalysisResult {
  /** The profile change event being analyzed. */
  changeEvent: ProfileChangeEvent;

  /** Comparison window size in days. */
  windowDays: number;

  /** Statistics for the period BEFORE the change. */
  preChange: PeriodStats;

  /** Statistics for the period AFTER the change. */
  postChange: PeriodStats;

  /** Pre-computed deltas for easy consumption. */
  deltas: ImpactDeltas;

  /** Hourly aggregates for the pre-change period (for ghost chart). */
  preHourlyAggregates: HourlyAggregate[];

  /** Hourly aggregates for the post-change period. */
  postHourlyAggregates: HourlyAggregate[];

  /** Data quality indicators. */
  dataQuality: DataQualityAssessment;

  /** Timestamp when analysis was computed (ms). */
  computedAt: number;
}

/**
 * Input parameters for impact analysis.
 */
export interface ImpactAnalysisParams {
  /** The profile change event to analyze. */
  changeEvent: ProfileChangeEvent;
  /** Number of days before/after to compare. Default: 7. */
  windowDays?: number;
  /** Custom TIR thresholds (uses app defaults if not provided). */
  tirThresholds?: TirThresholds;
}

// =============================================================================
// LLM TOOL TYPES
// =============================================================================

/**
 * Tool input schema for LLM consumption.
 */
export interface AnalyzeSettingsImpactToolInput {
  /** ISO date string of the change to analyze. */
  changeDate: string;
  /** Days before/after to compare (default: 7, max: 30). */
  windowDays?: number;
}

/**
 * Tool output schema (subset of ImpactAnalysisResult for LLM).
 */
export interface AnalyzeSettingsImpactToolOutput {
  success: boolean;
  changeDate: string;
  windowDays: number;
  profileName?: string;

  preChange: {
    avgBg: number | null;
    tirPercent: number;
    hypoCount: number;
    cv: number | null;
  };

  postChange: {
    avgBg: number | null;
    tirPercent: number;
    hypoCount: number;
    cv: number | null;
  };

  deltas: {
    tirDelta: number;
    avgBgDelta: number | null;
    isSignificant: boolean;
    overallTrend: 'improved' | 'worsened' | 'mixed' | 'neutral';
  };

  /** Natural language summary for the LLM to use. */
  summary: string;

  /** Data quality warning if applicable. */
  warning?: string;
}

/**
 * Tool output for profile history query.
 */
export interface ProfileHistoryToolOutput {
  count: number;
  events: Array<{
    date: string;
    source: LoopSystemSource;
    summary: string;
    profileName?: string;
  }>;
}

// =============================================================================
// UI STATE TYPES
// =============================================================================

/**
 * State for profile history loading.
 */
export type ProfileHistoryState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; events: ProfileChangeEvent[]}
  | {status: 'error'; error: string};

/**
 * State for impact analysis loading.
 */
export type ImpactAnalysisState =
  | {status: 'idle'}
  | {status: 'loading'}
  | {status: 'success'; result: ImpactAnalysisResult}
  | {status: 'error'; error: string};

/**
 * Comparison window options for UI.
 */
export type ComparisonWindowOption = 3 | 7 | 14 | 30;

/**
 * Props for the ghost chart comparison component.
 */
export interface GhostChartProps {
  /** Hourly aggregates for the pre-change period. */
  preHourly: HourlyAggregate[];
  /** Hourly aggregates for the post-change period. */
  postHourly: HourlyAggregate[];
  /** Whether to show P25-P75 confidence bands. */
  showConfidenceBands?: boolean;
  /** Height of the chart in pixels. */
  height?: number;
}

// =============================================================================
// AI ANALYST MODE TYPES
// =============================================================================

/**
 * The two analysis modes available in AI Analyst.
 */
export type AnalystMode = 'behavior' | 'settings';

/**
 * Time of day segments for analysis.
 */
export type TimeOfDaySegment = 'all' | 'overnight' | 'morning' | 'afternoon' | 'evening';

/**
 * Meal type for meal response analysis.
 */
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'all';

/**
 * Glucose focus area for pattern analysis.
 */
export type GlucoseFocusArea = 'all' | 'overnight' | 'post-meal' | 'fasting';

/**
 * Settings change type filter.
 */
export type SettingsChangeTypeFilter = 'all' | 'carb_ratio' | 'isf' | 'targets' | 'basal' | 'dia';

/**
 * Parameters for glucose pattern analysis.
 */
export interface GlucosePatternParams {
  daysBack: number;
  focusTime: GlucoseFocusArea;
}

/**
 * Parameters for time in range analysis with time of day filtering.
 */
export interface TimeInRangeParams {
  startDate: string;
  endDate: string;
  timeOfDay?: TimeOfDaySegment;
}

/**
 * Parameters for comparing two time periods.
 */
export interface ComparePeriodParams {
  period1Start: string;
  period1End: string;
  period2Start: string;
  period2End: string;
}

/**
 * Parameters for meal response analysis.
 */
export interface MealResponseParams {
  daysBack: number;
  mealType: MealType;
}

/**
 * Glucose pattern identified in data.
 */
export interface GlucosePattern {
  /** Type of pattern */
  type: 'recurring_high' | 'recurring_low' | 'high_variability' | 'consistent';
  /** Time of day when pattern occurs */
  timeOfDay: TimeOfDaySegment;
  /** Description of the pattern */
  description: string;
  /** Frequency (e.g., "4 of 7 days") */
  frequency: string;
  /** Average glucose during pattern */
  averageBg: number;
  /** Severity: low, medium, high */
  severity: 'low' | 'medium' | 'high';
}

/**
 * Meal response analysis result.
 */
export interface MealResponseAnalysis {
  mealType: MealType;
  /** Average pre-meal glucose */
  preMealAvg: number;
  /** Average peak glucose after meal */
  peakAvg: number;
  /** Average time to peak (minutes) */
  timeToPeak: number;
  /** Average glucose at 2 hours post-meal */
  twoHourAvg: number;
  /** Number of meals analyzed */
  mealCount: number;
  /** Time in range during 3-hour post-meal window */
  postMealTir: number;
}

/**
 * Settings recommendation from AI analysis.
 */
export interface SettingsRecommendation {
  /** Which setting to change */
  settingType: 'carb_ratio' | 'isf' | 'basal' | 'target_low' | 'target_high' | 'dia';
  /** Current value (formatted string like "1:10" for CR) */
  currentValue: string;
  /** Suggested new value */
  suggestedValue: string;
  /** Time slot if applicable (e.g., "12am-6am") */
  timeSlot?: string;
  /** Confidence level of recommendation */
  confidence: 'low' | 'medium' | 'high';
  /** Evidence supporting the recommendation */
  evidence: string[];
  /** Reasoning for the change */
  reasoning: string;
  /** Potential risks/cautions */
  caution: string;
  /** Expected outcome */
  expectedOutcome: string;
}

