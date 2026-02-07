import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {AiAnalystToolName} from 'app/services/aiAnalyst/aiAnalystLocalTools';

// ---------------------------------------------------------------------------
// Tool envelope – structured shape the LLM returns
// ---------------------------------------------------------------------------

export type ToolEnvelope =
  | {type: 'tool_call'; name: AiAnalystToolName; args?: any}
  | {type: 'final'; content: string}
  | {type: 'ask_patient'; question: string; options: PatientQuestionOption[]};

/** A single option in a structured multiple-choice question to the patient. */
export interface PatientQuestionOption {
  /** Short label, e.g. "a", "b", "c", "d". */
  key: string;
  /** Human-readable option text. */
  label: string;
}

// ---------------------------------------------------------------------------
// LLM provider interface (subset used by the tool loop)
// ---------------------------------------------------------------------------

export interface LlmProvider {
  sendChat(params: {
    model: string;
    messages: LlmChatMessage[];
    temperature?: number;
    maxOutputTokens?: number;
    abortSignal?: AbortSignal;
  }): Promise<{content: string}>;
}

// ---------------------------------------------------------------------------
// Tool-loop configuration
// ---------------------------------------------------------------------------

export interface ToolLoopCallbacks {
  /** Called before each tool execution with the tool name. */
  onToolStart?: (toolName: string) => void;
  /** Called after each tool execution with the result (for data-used tracking). */
  onToolResult?: (toolName: AiAnalystToolName, result: any) => void;
  /** Return true if the current run has been cancelled. */
  isCancelled: () => boolean;
  /** Called when the LLM emits an ask_patient envelope (structured question). */
  onStructuredQuestion?: (question: string, options: PatientQuestionOption[]) => void;
}

export interface ToolLoopParams {
  provider: LlmProvider;
  model: string;
  systemPrompt: string;
  initialMessages: LlmChatMessage[];
  maxToolCalls: number;
  maxOutputTokens: number;
  temperature?: number;
  abortSignal?: AbortSignal;
  callbacks: ToolLoopCallbacks;
  /** Whether to apply Loop Settings Advisor guardrails (basal/placeholder rewrite). */
  isLoopSettingsMode?: boolean;
  /** Whether to run expert-perspective reflection on final recommendations. */
  enableExpertReflection?: boolean;
}

export interface ToolLoopResult {
  /** The final text content from the LLM (after any tool calls / rewrites). */
  finalText: string;
  /** Full LLM message history including tool-call exchanges. */
  llmMessages: LlmChatMessage[];
  /** If the loop ended with a structured question (ask_patient), the envelope is here. */
  structuredQuestion?: {question: string; options: PatientQuestionOption[]};
}
