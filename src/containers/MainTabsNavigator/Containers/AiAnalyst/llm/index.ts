// ---------------------------------------------------------------------------
// LLM subsystem barrel – public surface of the llm/ feature-folder
// ---------------------------------------------------------------------------

// Types
export type {
  ToolEnvelope,
  PatientQuestionOption,
  LlmProvider,
  ToolLoopCallbacks,
  ToolLoopParams,
  ToolLoopResult,
} from './types';

// Core loop
export {runLlmToolLoop} from './runToolLoop';

// Utilities
export {withTimeout} from './withTimeout';
export {tryParseToolEnvelope} from './parseToolEnvelope';

// Constants
export {
  TOOL_TIMEOUT_MS,
  LLM_TIMEOUT_MS,
  DEFAULT_MAX_TOOL_CALLS,
  LOOP_SETTINGS_MAX_TOOL_CALLS,
  DEFAULT_MAX_OUTPUT_TOKENS,
  USER_BEHAVIOR_MAX_OUTPUT_TOKENS,
  LOOP_SETTINGS_MAX_OUTPUT_TOKENS,
  TOOL_LIMIT_MESSAGE,
  EMPTY_RESPONSE_FALLBACK,
} from './constants';

// Prompts
export {
  buildSystemPrompt,
  DEFAULT_TOOL_SYSTEM_PROMPT,
  LOOP_SETTINGS_TOOL_SYSTEM_PROMPT,
  buildGlucoseThresholdsBlock,
} from './prompts';

// Guardrails
export {
  maybeRewriteLoopSettingsResponse,
  looksLikeBasalRecommendation,
  looksLikePlaceholderValues,
  maybeReflectAsEndoExpert,
} from './guardrails';
