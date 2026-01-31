/**
 * Impact Analysis Service
 *
 * Core analysis engine that computes before/after comparison for
 * a profile change event. This is the "headless" engine consumed
 * by both UI hooks and LLM tools.
 */

import {fetchBgDataForDateRangeUncached} from 'app/api/apiRequests';
import {
  ImpactAnalysisParams,
  ImpactAnalysisResult,
  TirThresholds,
} from 'app/types/loopAnalysis.types';
import {
  calculatePeriodStats,
  computeHourlyAggregates,
  computeDeltas,
  assessDataQuality,
  DEFAULT_TIR_THRESHOLDS,
} from './impactAnalysis.utils';
import {countProfileChangesInRange} from './profileHistoryService';

// =============================================================================
// CONSTANTS
// =============================================================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 7;
const MIN_WINDOW_DAYS = 1;
const MAX_WINDOW_DAYS = 30;

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Analyzes the impact of a settings change by comparing glucose metrics
 * before and after the change.
 *
 * @param params - Analysis parameters including changeEvent and windowDays
 * @returns Complete ImpactAnalysisResult
 *
 * @example
 * ```typescript
 * const result = await analyzeSettingsImpact({
 *   changeEvent: profileChangeEvent,
 *   windowDays: 7,
 * });
 *
 * console.log(`TIR changed by ${result.deltas.tirDelta}%`);
 * ```
 */
export async function analyzeSettingsImpact(
  params: ImpactAnalysisParams
): Promise<ImpactAnalysisResult> {
  const {changeEvent} = params;

  // Validate and clamp window days
  const windowDays = Math.min(
    MAX_WINDOW_DAYS,
    Math.max(MIN_WINDOW_DAYS, params.windowDays ?? DEFAULT_WINDOW_DAYS)
  );
  const windowMs = windowDays * MS_PER_DAY;

  // Use provided thresholds or defaults
  const thresholds: TirThresholds = params.tirThresholds ?? DEFAULT_TIR_THRESHOLDS;

  // Calculate date ranges
  const preStartMs = changeEvent.timestamp - windowMs;
  const preEndMs = changeEvent.timestamp;
  const postStartMs = changeEvent.timestamp;
  const postEndMs = Math.min(changeEvent.timestamp + windowMs, Date.now());

  // Fetch BG data for both periods in parallel
  const [preBgData, postBgData] = await Promise.all([
    fetchBgDataForDateRangeUncached(new Date(preStartMs), new Date(preEndMs)),
    fetchBgDataForDateRangeUncached(new Date(postStartMs), new Date(postEndMs)),
  ]);

  // Calculate statistics for both periods
  const preChange = calculatePeriodStats(preBgData, preStartMs, preEndMs, thresholds);
  const postChange = calculatePeriodStats(postBgData, postStartMs, postEndMs, thresholds);

  // Calculate hourly aggregates for ghost chart
  const preHourlyAggregates = computeHourlyAggregates(preBgData);
  const postHourlyAggregates = computeHourlyAggregates(postBgData);

  // Compute deltas
  const deltas = computeDeltas(preChange, postChange);

  // Assess data quality
  const dataQuality = assessDataQuality(preBgData, postBgData, windowDays);

  // Check for confounding profile changes within the window
  const changesInPostWindow = await countProfileChangesInRange(postStartMs, postEndMs);
  if (changesInPostWindow > 1) {
    dataQuality.warnings.push(
      `${changesInPostWindow - 1} additional profile change(s) detected in the post-change period. ` +
      `Consider using a shorter comparison window.`
    );
  }

  return {
    changeEvent,
    windowDays,
    preChange,
    postChange,
    deltas,
    preHourlyAggregates,
    postHourlyAggregates,
    dataQuality,
    computedAt: Date.now(),
  };
}

/**
 * Quick impact preview - fetches only TIR delta for list view.
 * More efficient than full analysis for rendering a list of changes.
 *
 * @param changeTimestamp - Timestamp of the change (ms)
 * @param windowDays - Comparison window size
 * @returns Quick preview with TIR delta or null if insufficient data
 */
export async function getQuickImpactPreview(
  changeTimestamp: number,
  windowDays: number = 7
): Promise<{tirDelta: number; isSignificant: boolean} | null> {
  const windowMs = windowDays * MS_PER_DAY;
  const thresholds = DEFAULT_TIR_THRESHOLDS;

  const preStartMs = changeTimestamp - windowMs;
  const preEndMs = changeTimestamp;
  const postStartMs = changeTimestamp;
  const postEndMs = Math.min(changeTimestamp + windowMs, Date.now());

  // Skip if post-period is mostly in the future
  if (postEndMs - postStartMs < windowMs * 0.5) {
    return null;
  }

  try {
    const [preBgData, postBgData] = await Promise.all([
      fetchBgDataForDateRangeUncached(new Date(preStartMs), new Date(preEndMs)),
      fetchBgDataForDateRangeUncached(new Date(postStartMs), new Date(postEndMs)),
    ]);

    // Check minimum data
    const minSamples = windowDays * 288 * 0.3; // 30% coverage minimum
    if (preBgData.length < minSamples || postBgData.length < minSamples) {
      return null;
    }

    const preStats = calculatePeriodStats(preBgData, preStartMs, preEndMs, thresholds);
    const postStats = calculatePeriodStats(postBgData, postStartMs, postEndMs, thresholds);

    const tirDelta = postStats.timeInRange.target - preStats.timeInRange.target;
    const isSignificant = Math.abs(tirDelta) >= 3;

    return {
      tirDelta: Math.round(tirDelta * 10) / 10,
      isSignificant,
    };
  } catch {
    return null;
  }
}

/**
 * Validates if an analysis can be performed for a given change event.
 * Checks data availability and timing constraints.
 *
 * @param changeTimestamp - Timestamp of the change (ms)
 * @param windowDays - Desired comparison window
 * @returns Validation result with warnings
 */
export function validateAnalysisWindow(
  changeTimestamp: number,
  windowDays: number
): {isValid: boolean; warnings: string[]} {
  const warnings: string[] = [];
  const windowMs = windowDays * MS_PER_DAY;
  const now = Date.now();

  // Check if change is in the future
  if (changeTimestamp > now) {
    return {
      isValid: false,
      warnings: ['Cannot analyze a future change.'],
    };
  }

  // Check if post-period is mostly in the future
  const postEndMs = changeTimestamp + windowMs;
  const availablePostMs = Math.max(0, now - changeTimestamp);
  const postCoverage = availablePostMs / windowMs;

  if (postCoverage < 0.3) {
    return {
      isValid: false,
      warnings: [
        `Only ${Math.round(postCoverage * 100)}% of the post-change period is available. ` +
        `Try a shorter comparison window or wait longer.`
      ],
    };
  }

  if (postCoverage < 0.7) {
    warnings.push(
      `Only ${Math.round(postCoverage * 100)}% of the post-change period is available yet.`
    );
  }

  // Check if pre-period would go before reasonable data availability (6 months)
  const preStartMs = changeTimestamp - windowMs;
  const sixMonthsAgo = now - 180 * MS_PER_DAY;

  if (preStartMs < sixMonthsAgo) {
    warnings.push('Pre-change period extends beyond typical data retention.');
  }

  return {isValid: true, warnings};
}
