import type {AiAnalystToolName} from 'app/services/aiAnalyst/aiAnalystLocalTools';

const MINIMUM_SUCCESSFUL_EVIDENCE_CALLS = 3;

export const LOOP_SETTINGS_EVIDENCE_SAFETY_RESPONSE =
  'I cannot safely provide a dosing or Loop-setting recommendation because I could not collect enough successful profile and glucose evidence. No settings were changed.';

const PROFILE_AND_SETTINGS_TOOLS: ReadonlySet<string> = new Set([
  'getPumpProfile',
  'getProfileChangeHistory',
  'getSettingsChangeHistory',
  'getCurrentProfileSettings',
  'get_profile_change_history',
  'get_settings_change_history',
  'get_current_profile_settings',
  'get_pump_profile',
]);

const GLUCOSE_AND_PATTERN_TOOLS: ReadonlySet<string> = new Set([
  'getCgmSamples',
  'getCgmData',
  'getHypoDetectiveContext',
  'getGlycemicEvents',
  'getGlucosePatterns',
  'analyzeTimeInRange',
  'comparePeriods',
  'analyzeSettingsImpact',
  'getGlucoseStats',
  'getMonthlyGlucoseSummary',
  'get_glucose_patterns',
  'analyze_time_in_range',
  'compare_periods',
  'get_glucose_stats',
  'get_monthly_glucose_summary',
  'get_cgm_samples',
  'get_cgm_data',
]);

const SUPPORTING_EVIDENCE_TOOLS: ReadonlySet<string> = new Set([
  'getTreatments',
  'getInsulinSummary',
  'getInsulinDeliveryStats',
  'analyzeMealResponses',
  'getMealAbsorptionData',
  'get_meal_absorption_data',
  'get_insulin_delivery_stats',
  'analyze_meal_responses',
  'get_treatments',
]);

const LOOP_SETTINGS_READ_ONLY_TOOLS: ReadonlySet<string> = new Set([
  ...PROFILE_AND_SETTINGS_TOOLS,
  ...GLUCOSE_AND_PATTERN_TOOLS,
  ...SUPPORTING_EVIDENCE_TOOLS,
  'searchMemory',
  'getMemoryByIds',
  'getPatientProfileSnapshot',
  'search_memory',
  'get_memory_by_ids',
  'get_patient_profile_snapshot',
]);

export interface LoopSettingsEvidenceState {
  readonly successfulRelevantCalls: number;
  readonly hasProfileOrSettings: boolean;
  readonly hasGlucoseOrPatterns: boolean;
}

export const createLoopSettingsEvidenceState = (): LoopSettingsEvidenceState => ({
  successfulRelevantCalls: 0,
  hasProfileOrSettings: false,
  hasGlucoseOrPatterns: false,
});

/** Runtime allowlist: Loop Settings can inspect data, but can never mutate it. */
export const isLoopSettingsReadOnlyTool = (toolName: string): boolean =>
  LOOP_SETTINGS_READ_ONLY_TOOLS.has(toolName);

const isSuccessfulResult = (result: unknown): boolean =>
  typeof result === 'object' && result !== null && 'ok' in result && result.ok === true;

/** Records only successful read-only evidence. Failed and unrelated tools do not count. */
export const recordLoopSettingsEvidence = (
  state: LoopSettingsEvidenceState,
  toolName: AiAnalystToolName,
  result: unknown,
): LoopSettingsEvidenceState => {
  if (!isSuccessfulResult(result)) {
    return state;
  }

  const isProfileOrSettings = PROFILE_AND_SETTINGS_TOOLS.has(toolName);
  const isGlucoseOrPatterns = GLUCOSE_AND_PATTERN_TOOLS.has(toolName);
  if (
    !isProfileOrSettings &&
    !isGlucoseOrPatterns &&
    !SUPPORTING_EVIDENCE_TOOLS.has(toolName)
  ) {
    return state;
  }

  return {
    successfulRelevantCalls: state.successfulRelevantCalls + 1,
    hasProfileOrSettings: state.hasProfileOrSettings || isProfileOrSettings,
    hasGlucoseOrPatterns: state.hasGlucoseOrPatterns || isGlucoseOrPatterns,
  };
};

export const hasMinimumLoopSettingsEvidence = (
  state: LoopSettingsEvidenceState,
): boolean =>
  state.successfulRelevantCalls >= MINIMUM_SUCCESSFUL_EVIDENCE_CALLS &&
  state.hasProfileOrSettings &&
  state.hasGlucoseOrPatterns;

export const canMeetLoopSettingsEvidenceMinimum = (
  state: LoopSettingsEvidenceState,
  remainingToolCalls: number,
): boolean => {
  const callsNeeded = Math.max(
    0,
    MINIMUM_SUCCESSFUL_EVIDENCE_CALLS - state.successfulRelevantCalls,
  );
  const missingRequiredCategories =
    Number(!state.hasProfileOrSettings) + Number(!state.hasGlucoseOrPatterns);
  return remainingToolCalls >= Math.max(callsNeeded, missingRequiredCategories);
};

export const buildLoopSettingsEvidenceRequest = (
  state: LoopSettingsEvidenceState,
): string => {
  const missing: string[] = [];
  if (!state.hasProfileOrSettings) {
    missing.push('the current Loop profile/settings');
  }
  if (!state.hasGlucoseOrPatterns) {
    missing.push('glucose history or pattern analysis');
  }
  const remaining = Math.max(
    0,
    MINIMUM_SUCCESSFUL_EVIDENCE_CALLS - state.successfulRelevantCalls,
  );

  return (
    'Safety requirement: do not give a dosing or Loop-setting recommendation yet. ' +
    `Collect at least ${remaining} more successful relevant tool result(s)` +
    `${missing.length ? `, including ${missing.join(' and ')}` : ''}. ` +
    'Call one read-only analysis tool now. Return only a tool_call envelope.'
  );
};
