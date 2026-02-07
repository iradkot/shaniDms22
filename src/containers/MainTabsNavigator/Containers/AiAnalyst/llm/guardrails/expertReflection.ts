// ---------------------------------------------------------------------------
// Expert-reflection guardrail (Chain-of-Verification pattern)
// ---------------------------------------------------------------------------
//
// After the LLM produces a final recommendation, we run a second pass where
// the LLM reviews its own response from the perspective of an endocrinology
// expert.  This catches:
//   • Clinically unsafe suggestions (hypo risk, excessive adjustments)
//   • Missing context (no trend data cited, no monitoring plan)
//   • Overconfident claims without data backing
//   • Incomplete analysis (should have called more tools)
//
// Inspired by the Chain-of-Verification (CoVe) paper — the model drafts,
// then self-verifies from a separate expert perspective, then revises.
// ---------------------------------------------------------------------------

import {LlmChatMessage} from 'app/services/llm/llmTypes';
import {LlmProvider} from '../types';
import {LLM_TIMEOUT_MS} from '../constants';
import {maxOutputTokensForModel} from '../../constants';
import {withTimeout} from '../withTimeout';
import {tryParseToolEnvelope} from '../parseToolEnvelope';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Minimum word count to trigger reflection (skip short clarification-style messages). */
const MIN_WORDS_FOR_REFLECTION = 60;

/** Patterns that indicate the response contains a recommendation worth reviewing. */
const RECOMMENDATION_INDICATORS = [
  /\bsuggested?\s+value\b/i,
  /\bcurrent\s+value\b/i,
  /\brecommend/i,
  /\badjust/i,
  /\bchange.*(?:isf|cr|carb.?ratio|target|dia)\b/i,
  /🎯/,
  /📊.*what\s+i\s+found/i,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ReflectionContext {
  provider: LlmProvider;
  model: string;
  systemPrompt: string;
  workingMessages: LlmChatMessage[];
  temperature: number | undefined;
  abortSignal: AbortSignal | undefined;
  isCancelled: () => boolean;
}

/**
 * Run an expert-perspective review on the LLM's final recommendation.
 *
 * Returns the original text if reflection is not needed or if the review
 * says the response is already sound.  Returns a revised response when
 * issues are found.
 */
export async function maybeReflectAsEndoExpert(
  text: string,
  ctx: ReflectionContext,
): Promise<string> {
  if (!shouldReflect(text)) return text;

  console.log('[ExpertReflection] Running endocrinology-expert review on recommendation…');

  // ── Step 1: Ask the model to critique its own response ────────────────
  const critiqueRes = await withTimeout(
    ctx.provider.sendChat({
      model: ctx.model,
      messages: [
        {role: 'system', content: EXPERT_REVIEW_SYSTEM_PROMPT},
        ...ctx.workingMessages,
        {role: 'assistant', content: text},
        {role: 'user', content: CRITIQUE_USER_PROMPT},
      ],
      temperature: 0.1, // low temp for analytical review
      maxOutputTokens: maxOutputTokensForModel(ctx.model, 600),
      abortSignal: ctx.abortSignal,
    }),
    LLM_TIMEOUT_MS,
    'Expert critique',
  );

  if (ctx.isCancelled()) return text;

  const critiqueRaw = critiqueRes.content?.trim?.()
    ? critiqueRes.content.trim()
    : String(critiqueRes.content ?? '');

  // If the critique says the response is fine, return as-is.
  if (critiqueIndicatesApproval(critiqueRaw)) {
    console.log('[ExpertReflection] Expert approved the response — no revision needed.');
    return text;
  }

  console.log('[ExpertReflection] Expert found issues — requesting revision…');

  // ── Step 2: Ask the model to revise based on the critique ─────────────
  const reviseRes = await withTimeout(
    ctx.provider.sendChat({
      model: ctx.model,
      messages: [
        {role: 'system', content: ctx.systemPrompt},
        ...ctx.workingMessages,
        {role: 'assistant', content: text},
        {
          role: 'user',
          content:
            `An endocrinology expert reviewed your recommendation and found these issues:\n\n` +
            `${critiqueRaw}\n\n` +
            `Please revise your response to address every issue raised above. ` +
            `Keep the same format. Return ONLY {"type":"final","content":"..."}.`,
        },
      ],
      temperature: ctx.temperature,
      maxOutputTokens: maxOutputTokensForModel(ctx.model, 1200),
      abortSignal: ctx.abortSignal,
    }),
    LLM_TIMEOUT_MS,
    'Expert revision',
  );

  if (ctx.isCancelled()) return text;

  const reviseRaw = reviseRes.content?.trim?.()
    ? reviseRes.content.trim()
    : String(reviseRes.content ?? '');

  const reviseEnv = tryParseToolEnvelope(reviseRaw);
  return reviseEnv?.type === 'final' ? reviseEnv.content : reviseRaw;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Only reflect on responses that look like actual recommendations. */
function shouldReflect(text: string): boolean {
  const wordCount = text.split(/\s+/).length;
  if (wordCount < MIN_WORDS_FOR_REFLECTION) return false;
  return RECOMMENDATION_INDICATORS.some(re => re.test(text));
}

/** Does the critique text indicate the response is already sound? */
function critiqueIndicatesApproval(critique: string): boolean {
  const lower = critique.toLowerCase();
  return (
    (lower.includes('no issues') || lower.includes('looks good') || lower.includes('approved') || lower.includes('no concerns')) &&
    !lower.includes('however') &&
    !lower.includes('but ') &&
    !lower.includes('issue:')
  );
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const EXPERT_REVIEW_SYSTEM_PROMPT =
  `You are a board-certified endocrinologist reviewing a diabetes technology advisor's recommendation to a patient using an automated insulin delivery (AID) system.\n\n` +
  `Your job is to catch problems with the recommendation. Evaluate it on these criteria:\n\n` +
  `1. **Safety**: Does the suggestion increase hypoglycemia risk? Are adjustments too aggressive (>10% change)?\n` +
  `2. **Evidence**: Is the recommendation backed by specific data from the conversation (dates, numbers, trends)? Or is it vague/generic?\n` +
  `3. **Completeness**: Does it include a monitoring plan? Does it address the patient's actual concern?\n` +
  `4. **Clinical accuracy**: Are the physiological explanations correct? Is the suggested direction of change appropriate?\n` +
  `5. **Scope**: Does it recommend more than one setting change at a time (risky)? Does it recommend basal schedule changes in a Loop system (usually ineffective)?\n\n` +
  `If the recommendation is sound, respond with: "No issues found. Approved."\n\n` +
  `If you find problems, list each one concisely as:\n` +
  `- Issue: [description]\n` +
  `- Fix: [what should change]\n\n` +
  `Be strict but fair. Focus only on clinical and safety issues, not style.`;

const CRITIQUE_USER_PROMPT =
  `Review the assistant's last recommendation from an endocrinology perspective. ` +
  `Check for: safety concerns, unsupported claims, missing monitoring plans, ` +
  `aggressive adjustments, and incomplete analysis. ` +
  `Respond concisely — either "No issues found. Approved." or a list of issues with fixes.`;
