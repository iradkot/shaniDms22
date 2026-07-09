import {BgSample} from 'app/types/day_bgs.types';

export type AgpComparisonPeriodKey = 'current' | 'previous';

export type AgpInsightCategory =
  | 'agp_pattern'
  | 'meal'
  | 'correction'
  | 'overnight'
  | 'morning'
  | 'settings'
  | 'loop_context';

export type AgpInsightConfidence = 'low' | 'medium' | 'high';

export type AgpSegmentKey =
  | 'overnight'
  | 'morning'
  | 'breakfast'
  | 'midday'
  | 'afternoon'
  | 'evening'
  | 'bedtime';

export type AgpTimeWindow = {
  key: AgpSegmentKey;
  labelHe: string;
  labelEn: string;
  startMinute: number;
  endMinute: number;
};

export type AgpSegmentStats = {
  key: AgpSegmentKey;
  labelHe: string;
  labelEn: string;
  startMinute: number;
  endMinute: number;
  sampleCount: number;
  tirPct: number | null;
  lowPct: number | null;
  highPct: number | null;
  averageBg: number | null;
  medianBg: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  variabilityBand: number | null;
};

export type AgpSegmentComparison = {
  key: AgpSegmentKey;
  labelHe: string;
  labelEn: string;
  current: AgpSegmentStats;
  previous: AgpSegmentStats;
  deltas: {
    tirPct: number | null;
    averageBg: number | null;
    medianBg: number | null;
    lowPct: number | null;
    highPct: number | null;
    variabilityBand: number | null;
  };
  significanceScore: number;
};

export type AgpMealEvent = {
  timestamp: number;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  carbsG: number;
  bolusU: number | null;
  minutesFromBolusToCarbs: number | null;
  bgAtMeal: number | null;
  peakBg: number | null;
  riseMgdl: number | null;
  twoHourBg: number | null;
  returnedToTargetBy3h: boolean | null;
};

export type AgpMealComparison = {
  mealType: AgpMealEvent['mealType'];
  currentCount: number;
  previousCount: number;
  currentAvgRise: number | null;
  previousAvgRise: number | null;
  currentAvgPeak: number | null;
  previousAvgPeak: number | null;
  currentAvgCarbs: number | null;
  previousAvgCarbs: number | null;
  currentAvgBolusMinutesBefore: number | null;
  previousAvgBolusMinutesBefore: number | null;
  examples: AgpMealEvent[];
};

export type AgpCorrectionComparison = {
  currentCount: number;
  previousCount: number;
  currentAvgDrop3h: number | null;
  previousAvgDrop3h: number | null;
  currentLowAfterCorrectionPct: number | null;
  previousLowAfterCorrectionPct: number | null;
};

export type AgpSettingsValueDiff = {
  setting: 'carbRatio' | 'isf' | 'basal' | 'targetLow' | 'targetHigh' | 'dia';
  windowKey?: AgpSegmentKey;
  labelHe: string;
  labelEn: string;
  previous: number | null;
  current: number | null;
  delta: number | null;
};

export type AgpLoopModePeriodSummary = {
  openPct: number | null;
  closedPct: number | null;
  unknownPct: number | null;
  knownCoveragePct: number | null;
  openHours: number | null;
  closedHours: number | null;
  openTirPct: number | null;
  closedTirPct: number | null;
  hasEnoughLoopCoverage: boolean;
  canCompareOpenClosed: boolean;
};

export type AgpLoopModeComparison = {
  current: AgpLoopModePeriodSummary;
  previous: AgpLoopModePeriodSummary;
  deltas: {
    openPct: number | null;
    closedPct: number | null;
    knownCoveragePct: number | null;
    closedTirPct: number | null;
    openTirPct: number | null;
  };
};

export type AgpPeriodEvidence = {
  key: AgpComparisonPeriodKey;
  range: {startMs: number; endMs: number};
  bgSamples: BgSample[];
  sampleCount: number;
  daysWithData: number;
};

export type AgpComparisonEvidence = {
  current: AgpPeriodEvidence;
  previous: AgpPeriodEvidence;
  segments: AgpSegmentComparison[];
  meals: AgpMealComparison[];
  corrections: AgpCorrectionComparison;
  settingsDiffs: AgpSettingsValueDiff[];
  loopMode: AgpLoopModeComparison | null;
  dataQuality: {
    currentCoveragePct: number;
    previousCoveragePct: number;
    warnings: string[];
  };
};

export type AgpComparisonInsight = {
  id: string;
  category: AgpInsightCategory;
  titleHe: string;
  titleEn: string;
  whatChangedHe: string;
  whatChangedEn: string;
  possibleDriversHe: string[];
  possibleDriversEn: string[];
  evidenceHe: string[];
  evidenceEn: string[];
  settingsContextHe?: string;
  settingsContextEn?: string;
  confidence: AgpInsightConfidence;
  segmentKey?: AgpSegmentKey;
};

export type AgpComparisonAnalysisResult = {
  evidence: AgpComparisonEvidence;
  insights: AgpComparisonInsight[];
  summaryHe: string;
  summaryEn: string;
  generatedAt: number;
  usedLlm: boolean;
};
