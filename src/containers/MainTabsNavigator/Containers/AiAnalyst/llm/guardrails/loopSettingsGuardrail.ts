// ---------------------------------------------------------------------------
// Loop Settings Advisor guardrail
// ---------------------------------------------------------------------------
//
// After the LLM produces a final response in Loop Settings mode we check
// for two common issues:
//   1. The response contains basal-rate recommendations (forbidden).
//   2. The response contains placeholder values like [X] or [Your current…].
//
// When either is detected, the response is rewritten via a follow-up LLM
// call that enforces the constraints.
// ---------------------------------------------------------------------------

import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {LlmProvider} from '../types';
import {LLM_TIMEOUT_MS} from '../constants';
import {maxOutputTokensForModel} from '../../constants';
import {withTimeout} from '../withTimeout';
import {tryParseToolEnvelope} from '../parseToolEnvelope';

// ---------------------------------------------------------------------------
// Pattern detectors
// ---------------------------------------------------------------------------

/** Does the text contain a basal-rate recommendation? */
export function looksLikeBasalRecommendation(text: string): boolean {
  return /\b(basal|basal rate|scheduled basal|u\/hr)\b/i.test(text ?? '');
}

/** Does the text contain placeholder values the user shouldn't see? */
export function looksLikePlaceholderValues(text: string): boolean {
  return /\[(x|y|your current|adjust to|suggested value|current value)[^\]]*\]/i.test(text ?? '');
}

// ---------------------------------------------------------------------------
// Rewrite logic
// ---------------------------------------------------------------------------

export interface GuardrailContext {
  provider: LlmProvider;
  model: string;
  systemPrompt: string;
  workingMessages: LlmChatMessage[];
  temperature: number | undefined;
  abortSignal: AbortSignal | undefined;
  isCancelled: () => boolean;
}

/**
 * If the Loop Settings response violates guardrails, rewrite it via
 * a constrained follow-up LLM call.  Returns the original text when
 * no rewrite is needed.
 */
export async function maybeRewriteLoopSettingsResponse(
  text: string,
  ctx: GuardrailContext,
): Promise<string> {
  const needsRewrite = looksLikeBasalRecommendation(text) || looksLikePlaceholderValues(text);
  if (!needsRewrite) return text;

  console.warn(
    '[LoopSettingsAdvisor] Rewriting response to enforce: no basal + no placeholders + include trend.',
  );

  const rewriteRes = await withTimeout(
    ctx.provider.sendChat({
      model: ctx.model,
      messages: [
        {role: 'system', content: ctx.systemPrompt},
        ...ctx.workingMessages,
        {
          role: 'user',
          content:
            `Rewrite your last answer with these constraints:\n` +
            `1) Do NOT recommend basal schedule changes.\n` +
            `2) Do NOT use placeholders like [X]/[Y]/[Your current...]. Use actual current values (call tools if needed).\n` +
            `3) Include at least one numeric trend comparison (TIR, avg BG, CV) relevant to the user's issue.\n\n` +
            `Return ONLY {"type":"final","content":"..."}.\n\n` +
            `Your last answer:\n${text}`,
        },
      ],
      temperature: ctx.temperature,
      maxOutputTokens: maxOutputTokensForModel(ctx.model, 1200),
      abortSignal: ctx.abortSignal,
    }),
    LLM_TIMEOUT_MS,
    'LLM rewrite',
  );

  if (ctx.isCancelled()) return text;

  const rewriteRaw = rewriteRes.content?.trim?.()
    ? rewriteRes.content.trim()
    : String(rewriteRes.content ?? '');

  const rewriteEnv = tryParseToolEnvelope(rewriteRaw);
  return rewriteEnv?.type === 'final' ? rewriteEnv.content : rewriteRaw;
}
