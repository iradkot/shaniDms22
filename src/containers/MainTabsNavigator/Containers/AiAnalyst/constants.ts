/** Disclosure shown in headers and sent with prompts. */
export const DISCLOSURE_TEXT =
  'AI Analyst sends your diabetes data (BG, treatments, device status) to an external LLM provider to generate insights.';

// ---------------------------------------------------------------------------
// Range / data-fetching defaults
// ---------------------------------------------------------------------------

/** Max days a user can request via range-parsing. */
export const MAX_RANGE_DAYS = 180;

/** Default range for the Hypo Detective mission (days). */
export const HYPO_DETECTIVE_RANGE_DAYS = 60;

/** Max hypo events fed into the Hypo Detective initial context. */
export const HYPO_DETECTIVE_MAX_EVENTS = 12;

/** Default range for the User Behavior mission (days). */
export const USER_BEHAVIOR_RANGE_DAYS = 14;

/** Max CGM samples for the User Behavior mission. */
export const USER_BEHAVIOR_MAX_SAMPLES = 1_000;

// ---------------------------------------------------------------------------
// LLM call limits
// ---------------------------------------------------------------------------

/** Default max tool calls per follow-up conversation turn. */
export const DEFAULT_MAX_TOOL_CALLS = 4;

/** Max tool calls for the Loop Settings Advisor. */
export const LOOP_SETTINGS_MAX_TOOL_CALLS = 20;

/** Timeout for individual tool execution (ms). */
export const TOOL_TIMEOUT_MS = 60_000;

/** Timeout for an LLM response (ms). */
export const LLM_TIMEOUT_MS = 60_000;

/** Duration to show "Stopped" progress label (ms). */
export const STOPPED_LABEL_DURATION_MS = 1_200;

/** Default maxOutputTokens for standard missions. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 800;

/** maxOutputTokens for User Behavior initial prompt. */
export const USER_BEHAVIOR_MAX_OUTPUT_TOKENS = 1_200;

/** maxOutputTokens for Loop Settings Advisor & rewrite calls. */
export const LOOP_SETTINGS_MAX_OUTPUT_TOKENS = 2_000;

// ---------------------------------------------------------------------------
// LLM temperature defaults
// ---------------------------------------------------------------------------

export const DEFAULT_TEMPERATURE = 0.2;
export const USER_BEHAVIOR_TEMPERATURE = 0.4;
export const LOOP_SETTINGS_TEMPERATURE = 0.3;

// ---------------------------------------------------------------------------
// UI layout constants
// ---------------------------------------------------------------------------

/** Auto-scroll delay after adding chat messages (ms). */
export const SCROLL_DELAY_MS = 50;

/** Max glycemic events when user wants dates/counts. */
export const MAX_EVENTS_WITH_DATES = 120;

/** Max glycemic events for regular follow-up. */
export const MAX_EVENTS_DEFAULT = 60;

// ---------------------------------------------------------------------------
// Guardrail: filler suffix pattern
// ---------------------------------------------------------------------------

/** Matches trailing filler phrases the LLM sometimes appends. */
export const FILLER_SUFFIX_REGEX =
  /\s*(?:one moment(?: please)?\.?|one moment please\.?|hang on\.?|hold on\.?|just a moment\.?)+\s*$/i;

/** Fallback message when the LLM response is empty after stripping filler. */
export const EMPTY_RESPONSE_FALLBACK =
  "If you'd like me to proceed, reply 'continue' and I'll run the next step.";

/** Text shown when a tool-call limit is hit. */
export const TOOL_LIMIT_MESSAGE =
  'I tried to fetch additional data, but hit the tool-call limit. Please try again (or ask for a smaller time range).';

// ---------------------------------------------------------------------------
// Mission display titles
// ---------------------------------------------------------------------------

const MISSION_TITLES: Record<string, string> = {
  loopSettings: 'Loop Settings Advisor',
  userBehavior: 'User Behavior Tips',
  hypoDetective: 'Hypo Detective',
};

export function getMissionTitle(mission: string | undefined): string {
  return MISSION_TITLES[mission ?? ''] ?? 'Hypo Detective';
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** Generate a unique conversation ID. */
export function makeConversationId(): string {
  return `ai-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Return a temperature value, or undefined for reasoning-series models (o1, o3, …). */
export function temperatureForModel(model: string, defaultTemp: number): number | undefined {
  return model.trim().startsWith('o') ? undefined : defaultTemp;
}

/**
 * Scale maxOutputTokens for the given model.
 *
 * O-series (reasoning) models include *thinking* tokens in the
 * max_output_tokens budget.  A 1 200-token limit can be entirely
 * consumed by reasoning, producing zero visible output.  We bump the
 * limit to 16 384 for these models, which is safe (o4-mini supports
 * up to 100 k) and avoids truncation errors on complex conversations.
 */
export function maxOutputTokensForModel(model: string, defaultTokens: number): number {
  return model.trim().startsWith('o') ? Math.max(defaultTokens, 16_384) : defaultTokens;
}
