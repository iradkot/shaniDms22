/**
 * Shared constants for the Investigate Events (Oracle) feature.
 *
 * Keep domain constants in one place so UI copy, matching, and caching remain consistent.
 */

export const ORACLE_CACHE_DAYS = 90;

export const ORACLE_MINUTES_PER_DAY = 24 * 60;
export const ORACLE_MINUTE_MS = 60 * 1000;
export const ORACLE_HOUR_MS = 60 * ORACLE_MINUTE_MS;
export const ORACLE_DAY_MS = 24 * ORACLE_HOUR_MS;

// Recent window used to compute event candidates / current slope.
export const ORACLE_RECENT_WINDOW_HOURS = 3;

// Chart trace windows.
export const ORACLE_CHART_PAST_MIN = 120; // -2h
export const ORACLE_CHART_FUTURE_MIN = 240; // +4h

// Feature extraction.
export const ORACLE_SLOPE_WINDOW_MIN = 15;

// Matching tolerances.
export const ORACLE_TIME_WINDOW_MIN = 90;
export const ORACLE_BG_TOLERANCE_FIXED = 15;
export const ORACLE_BG_TOLERANCE_PERCENT = 0.1;
export const ORACLE_SLOPE_TOLERANCE = 2; // mg/dL/min

// Treatments / IOB filtering.
export const ORACLE_ACTION_WINDOW_MIN = 30;
export const ORACLE_IOB_TOLERANCE_U = 1.0;
export const ORACLE_COB_TOLERANCE_G = 20;
export const ORACLE_LOAD_MAX_MATCH_DISTANCE_MIN = 10;

// Outcome metrics.
export const ORACLE_TARGET_BG_MIN_2H = 70;
export const ORACLE_TARGET_BG_MAX_2H = 140;
export const ORACLE_TARGET_BG_IDEAL_2H = 110;

export const ORACLE_DISCLAIMER_TEXT =
  'Informational only. Not medical advice. Always follow your clinician\’s guidance and your therapy settings.';
