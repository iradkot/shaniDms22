// ---------------------------------------------------------------------------
// System prompt composer — assembles per-mode system prompts
// ---------------------------------------------------------------------------

export {AI_ANALYST_SYSTEM_PROMPT} from './baseAnalyst';
export {USER_BEHAVIOR_SYSTEM_PROMPT} from './userBehavior';
export {
  LOOP_SETTINGS_ADVISOR_SYSTEM_PROMPT,
  LOOP_SETTINGS_TOOLS_DESCRIPTION,
} from './loopSettingsAdvisor';
export {
  DEFAULT_TOOL_SYSTEM_PROMPT,
  LOOP_SETTINGS_TOOL_SYSTEM_PROMPT,
} from './toolInstructions';
export {buildGlucoseThresholdsBlock} from './glucoseThresholds';

import {GlucoseSettings} from 'app/contexts/GlucoseSettingsContext';
import {AnalystMode} from '../../types';

import {AI_ANALYST_SYSTEM_PROMPT} from './baseAnalyst';
import {USER_BEHAVIOR_SYSTEM_PROMPT} from './userBehavior';
import {LOOP_SETTINGS_ADVISOR_SYSTEM_PROMPT} from './loopSettingsAdvisor';
import {DEFAULT_TOOL_SYSTEM_PROMPT, LOOP_SETTINGS_TOOL_SYSTEM_PROMPT} from './toolInstructions';
import {buildGlucoseThresholdsBlock} from './glucoseThresholds';

// ---------------------------------------------------------------------------
// Public composer
// ---------------------------------------------------------------------------

/**
 * Build the full system prompt string for a given analyst mode.
 *
 * - **loopSettings** → advisor prompt + extended tool instructions + glucose thresholds
 * - **userBehavior** → user behavior prompt (no tools)
 * - *default*        → base analyst prompt + default tool instructions
 */
export function buildSystemPrompt(
  analystMode: AnalystMode | null,
  glucoseSettings: GlucoseSettings,
): string {
  if (analystMode === 'loopSettings') {
    return (
      LOOP_SETTINGS_ADVISOR_SYSTEM_PROMPT +
      '\n' +
      LOOP_SETTINGS_TOOL_SYSTEM_PROMPT +
      buildGlucoseThresholdsBlock(glucoseSettings)
    );
  }

  if (analystMode === 'userBehavior') {
    return USER_BEHAVIOR_SYSTEM_PROMPT;
  }

  return AI_ANALYST_SYSTEM_PROMPT + '\n' + DEFAULT_TOOL_SYSTEM_PROMPT;
}
