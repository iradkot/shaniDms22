// ---------------------------------------------------------------------------
// LLM-specific constants — timeouts, limits, and fallback messages
// ---------------------------------------------------------------------------

/** Timeout for individual tool execution (ms). */
export const TOOL_TIMEOUT_MS = 60_000;

/** Timeout for an LLM response (ms). */
export const LLM_TIMEOUT_MS = 60_000;

/** Default max tool calls per follow-up conversation turn. */
export const DEFAULT_MAX_TOOL_CALLS = 4;

/** Max tool calls for the Loop Settings Advisor. */
export const LOOP_SETTINGS_MAX_TOOL_CALLS = 20;

/** Default maxOutputTokens for standard missions. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 800;

/** maxOutputTokens for User Behavior initial prompt. */
export const USER_BEHAVIOR_MAX_OUTPUT_TOKENS = 1_200;

/** maxOutputTokens for Loop Settings Advisor & rewrite calls. */
export const LOOP_SETTINGS_MAX_OUTPUT_TOKENS = 1_200;

/** Text shown when a tool-call limit is hit. */
export const TOOL_LIMIT_MESSAGE =
  'I tried to fetch additional data, but hit the tool-call limit. Please try again (or ask for a smaller time range).';

/** Fallback message when the LLM response is empty after stripping filler. */
export const EMPTY_RESPONSE_FALLBACK =
  "If you'd like me to proceed, reply 'continue' and I'll run the next step.";
