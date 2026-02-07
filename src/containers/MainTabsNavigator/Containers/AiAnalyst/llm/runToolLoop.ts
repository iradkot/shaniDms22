// ---------------------------------------------------------------------------
// Core LLM tool-call loop
// ---------------------------------------------------------------------------
//
// Orchestrates a multi-turn conversation where the LLM may request local
// tool executions.  The loop continues until the LLM emits a final response
// or the tool-call budget is exhausted.
//
// Guardrails (e.g. Loop Settings rewrite) run after the final response
// is determined but before it is returned.
// ---------------------------------------------------------------------------

import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {AiAnalystToolName, runAiAnalystTool} from 'app/services/aiAnalyst/aiAnalystLocalTools';

import {ToolLoopParams, ToolLoopResult} from './types';
import {TOOL_TIMEOUT_MS, LLM_TIMEOUT_MS, TOOL_LIMIT_MESSAGE} from './constants';
import {tryParseToolEnvelope} from './parseToolEnvelope';
import {withTimeout} from './withTimeout';
import {maybeRewriteLoopSettingsResponse, maybeReflectAsEndoExpert} from './guardrails';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run an LLM conversation that may include tool calls.
 *
 * 1. Send context to the LLM.
 * 2. If the LLM asks for a tool → execute it, append the result, loop.
 * 3. Once the LLM returns a final answer (or hits the limit) → apply
 *    any post-response guardrails → return.
 */
export async function runLlmToolLoop(params: ToolLoopParams): Promise<ToolLoopResult> {
  const {
    provider,
    model,
    systemPrompt,
    initialMessages,
    maxToolCalls,
    maxOutputTokens,
    temperature,
    abortSignal,
    callbacks,
    isLoopSettingsMode = false,
    enableExpertReflection = false,
  } = params;

  let workingMessages: LlmChatMessage[] = [...initialMessages];
  let toolCalls = 0;
  let finalText: string | null = null;
  let structuredQuestion: ToolLoopResult['structuredQuestion'];

  // ── Main loop: send → parse → maybe execute tool → repeat ────────────
  while (finalText == null) {
    let raw: string;
    try {
      raw = await sendLlmRequest(
        provider, model, systemPrompt, workingMessages,
        temperature, maxOutputTokens, abortSignal,
      );
    } catch (err: any) {
      // Graceful handling for truncated / incomplete responses.
      // The provider may throw when the model exhausts its output-token
      // budget (common with o-series reasoning models).  Surface a
      // user-friendly message instead of the raw provider error.
      if (err?.isIncompleteResponse) {
        console.warn('[AiAnalyst] LLM response incomplete (likely max_output_tokens)');
        finalText =
          'My response was cut short — the conversation context may be too large. ' +
          'Try starting a new session or asking a simpler question.';
        workingMessages = [
          ...workingMessages,
          {role: 'assistant', content: finalText},
        ];
        break;
      }
      throw err; // re-throw non-incomplete errors
    }

    if (callbacks.isCancelled()) {
      return {finalText: '', llmMessages: workingMessages};
    }

    const envelope = tryParseToolEnvelope(raw);

    // -- Tool call within budget --
    if (envelope?.type === 'tool_call' && toolCalls < maxToolCalls) {
      toolCalls += 1;
      console.log(`[AiAnalyst] Tool call #${toolCalls}: ${envelope.name}`, envelope.args);

      const toolResult = await executeToolCall(
        envelope.name, envelope.args, callbacks,
      );

      if (callbacks.isCancelled()) {
        return {finalText: '', llmMessages: workingMessages};
      }

      workingMessages = appendToolExchange(workingMessages, raw, envelope.name, toolResult);
      continue;
    }

    // -- Structured patient question (ask_patient) --
    if (envelope?.type === 'ask_patient') {
      console.log('[AiAnalyst] Structured question for patient:', envelope.question);
      structuredQuestion = {question: envelope.question, options: envelope.options};
      callbacks.onStructuredQuestion?.(envelope.question, envelope.options);

      // Format the question + options as readable Markdown for display
      finalText = formatStructuredQuestion(envelope.question, envelope.options);
      workingMessages = [
        ...workingMessages,
        {role: 'assistant', content: raw},
      ];
      break;
    }

    // -- Tool call but budget exhausted --
    if (envelope?.type === 'tool_call') {
      console.warn(`[AiAnalyst] Tool call limit reached (${maxToolCalls})`);
      finalText = TOOL_LIMIT_MESSAGE;
    } else {
      finalText = envelope?.type === 'final' ? envelope.content : raw;
    }

    // -- Post-response guardrails --
    if (isLoopSettingsMode && finalText) {
      finalText = await maybeRewriteLoopSettingsResponse(finalText, {
        provider,
        model,
        systemPrompt,
        workingMessages,
        temperature,
        abortSignal,
        isCancelled: callbacks.isCancelled,
      });
    }

    // -- Expert reflection (Chain-of-Verification) --
    if (enableExpertReflection && finalText) {
      finalText = await maybeReflectAsEndoExpert(finalText, {
        provider,
        model,
        systemPrompt,
        workingMessages,
        temperature,
        abortSignal,
        isCancelled: callbacks.isCancelled,
      });
    }

    workingMessages = [
      ...workingMessages,
      {role: 'assistant', content: finalText.trim()},
    ];
  }

  return {finalText: finalText.trim(), llmMessages: workingMessages, structuredQuestion};
}

// ---------------------------------------------------------------------------
// Private helpers – each does exactly one thing
// ---------------------------------------------------------------------------

/** Send a single chat request to the LLM with a timeout. */
async function sendLlmRequest(
  provider: ToolLoopParams['provider'],
  model: string,
  systemPrompt: string,
  messages: LlmChatMessage[],
  temperature: number | undefined,
  maxOutputTokens: number,
  abortSignal: AbortSignal | undefined,
): Promise<string> {
  const res = await withTimeout(
    provider.sendChat({
      model,
      messages: [{role: 'system', content: systemPrompt}, ...messages],
      temperature,
      maxOutputTokens,
      abortSignal,
    }),
    LLM_TIMEOUT_MS,
    'LLM response',
  );

  return res.content?.trim?.() ? res.content.trim() : String(res.content ?? '');
}

/** Execute a local tool call with a timeout and fire callbacks. */
async function executeToolCall(
  toolName: AiAnalystToolName,
  toolArgs: any,
  callbacks: ToolLoopParams['callbacks'],
): Promise<any> {
  callbacks.onToolStart?.(toolName);

  const result = await withTimeout(
    runAiAnalystTool(toolName, toolArgs),
    TOOL_TIMEOUT_MS,
    `Tool ${toolName}`,
  );

  callbacks.onToolResult?.(toolName, result);
  console.log(
    `[AiAnalyst] Tool ${toolName} result:`,
    result.ok ? 'SUCCESS' : `FAILED: ${result.error}`,
  );

  return result;
}

/** Append a tool-call exchange (assistant request + tool result) to messages. */
function appendToolExchange(
  messages: LlmChatMessage[],
  assistantRaw: string,
  toolName: string,
  toolResult: any,
): LlmChatMessage[] {
  return [
    ...messages,
    {role: 'assistant', content: assistantRaw},
    {role: 'user', content: `Tool result (${toolName}):\n${JSON.stringify(toolResult)}`},
  ];
}

/** Format a structured ask_patient question as readable Markdown. */
function formatStructuredQuestion(
  question: string,
  options: {key: string; label: string}[],
): string {
  const optionLines = options
    .map(o => `**${o.key})** ${o.label}`)
    .join('\n');
  return `${question}\n\n${optionLines}\n\n*You can also type your own answer if none of these fit.*`;
}
