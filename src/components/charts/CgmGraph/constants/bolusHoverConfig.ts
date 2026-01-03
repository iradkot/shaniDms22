/**
 * Configuration for bolus hit-testing on the CGM chart.
 *
 * Goal: make bolus events easy to discover on touch without requiring pixel-perfect taps.
 */
export const BOLUS_HOVER_CONFIG = {
  /**
   * Primary time window for selecting bolus events around the touch time.
   *
   * Note: CGM samples are often 5-minute cadence, so 5 minutes is a sensible default.
   */
  detectionWindowMinutes: 5,

  /**
   * Pixel radius for detecting bolus markers even if the touch isn't exactly on the marker.
   */
  spatialDetectionRadiusPx: 40,

  /**
   * Max events to show in a single tooltip to avoid overflow.
   */
  maxBolusEventsInTooltip: 5,
} as const;

export const BOLUS_DETECTION_WINDOW_MS =
  BOLUS_HOVER_CONFIG.detectionWindowMinutes * 60 * 1000;
