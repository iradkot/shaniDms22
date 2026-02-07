// ---------------------------------------------------------------------------
// Glucose thresholds block – appended to Loop Settings system prompts
// ---------------------------------------------------------------------------

import {GlucoseSettings} from 'app/contexts/GlucoseSettingsContext';

/**
 * Render the user's glucose thresholds and night window into a Markdown block
 * that will be appended to the system prompt so the LLM can reference actual
 * patient settings.
 */
export function buildGlucoseThresholdsBlock(gs: GlucoseSettings): string {
  const nightStart = String(gs.nightStartHour).padStart(2, '0');
  const nightEnd = String(gs.nightEndHour).padStart(2, '0');
  const wraps = gs.nightStartHour > gs.nightEndHour ? ' (wraps midnight)' : '';

  return (
    `\n\n## User glucose thresholds + night window (from app settings)\n` +
    `- Severe low (<=): ${gs.severeHypo} mg/dL\n` +
    `- Low (<): ${gs.hypo} mg/dL\n` +
    `- High (>): ${gs.hyper} mg/dL\n` +
    `- Severe high (>=): ${gs.severeHyper} mg/dL\n` +
    `- Overnight window (local): ${nightStart}:00–${nightEnd}:00${wraps}\n`
  );
}
