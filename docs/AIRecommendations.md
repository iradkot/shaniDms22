# AI recommendations

The current AI Analyst entry point is the shared recommendation experience in
`src/product/ai/AiAnalystModuleView.tsx`. It runs in native and browser clients.
The earlier specialist catalogue and the legacy Oracle/LoopTuner tabs are hidden;
their route identities and analysis code remain for compatibility.

## Patient flow

- Now: one tap for a short, current-context recommendation.
- Before a meal: choose small, medium, or large, then request guidance. Size is
  never converted automatically into carbohydrate grams or an insulin dose.
- Week/month: one tap, using 7 or 30 days of evidence.
- Focused recommendation: choose period, food/routine/care-team discussion,
  goal, response length, and optional notes using a short guided form.
- Continue the conversation, inspect its evidence, reopen history, or give
  helpful/not-helpful feedback with optional reasons and a comment.
- After negative feedback, explicitly request an adjusted answer using the
  selected reasons or comment. The original answer stays in the conversation.

## Execution

`useRecommendationRuntime` adds one portable recommendation flow to the existing
platform runtimes. A deterministic manager loads scoped history and a single
evidence snapshot. `recommendationOrchestrator` then runs one specialist for a
now/meal request or two parallel specialists for a week/month. A separate final
reviewer checks the original evidence and writes the only displayed answer.
This is at most two or three model calls. The configured provider/model and
authenticated proxy remain in use. No new agent SDK is required.

The provider has no write tools. Prompts prohibit dose calculations and therapy
setting changes. A care-team plan contains observations and questions for a
clinician. Missing, incomplete, and old data remain explicit. Provider or final
review failure produces a retryable error; an unreviewed draft is never displayed.
This is an application boundary, not a claim of clinical validation.

Calls have deadlines and cancellation. A Workspace switch invalidates in-flight
results. Navigation generations also prevent a delayed history load from
reopening a screen after Back. A separate scope generation rejects old memory
save completions even after switching A → B → A.

Contextual AI buttons use this same pipeline and preserve explicit day/period
selection across continuation and retry. Saved legacy AI shortcuts and the old
Loop Assist route open the unified experience. Historical evidence is labeled
with its selected interval; it is never presented as a current glucose reading.
Recorded bolus/carbohydrate evidence does not invent basal delivery from today's
profile. Stop restores the prior conversation and the pending question.

The latest patient question or correction takes precedence over older personal
context in every agent prompt. A narrow output check rejects explicit dose and
therapy-setting directives; it complements the reviewer and cannot establish
clinical correctness of arbitrary generated text.

## Memory

`recommendationMemory` uses scoped local storage on native and IndexedDB on web.
It retains explicit patient instructions, recent patient questions, feedback
linked to an answer, and text conversation history. The latest vote replaces an
older vote for the same answer. Bounded context prioritizes explicit instructions,
then feedback and recent questions. Old patient messages can be imported once
from the existing history. Assistant statements are never promoted into clinical
facts or inferred patient instructions.

Memory is local to a device/browser and Product User + Workspace. Relevant
selected context is sent to the configured AI provider when generating an answer.
The patient can edit instructions, disable personalization, or clear memory.
Clearing memory keeps readable history but prevents automatic reimport of old
questions. Clearing history removes its questions and feedback as well.
Feedback expresses usefulness and preferences, not proof of clinical efficacy.

## Verification

Automated suites cover routing/call budgets, failed final review, deadlines,
workspace isolation, feedback replacement and history truncation, persistence,
retry, navigation races, memory opt-out, and monthly evidence ranges. The mobile
browser preview uses synthetic data and the production view; it does not call a
provider. APK builds use the internal preview signing configuration.

The implementation has not been clinically validated or tested against a real
patient's live model output as part of this change. Preferences do not currently
sync between devices.

The primary-source research and architecture rationale are in
[the orchestration research note](research/ai-recommendation-orchestration.md).
The follow-up [patient personalization review](research/patient-ai-personalization-2026.md)
covers eight primary studies from 2024–2026 and distinguishes product hypotheses
from demonstrated clinical outcomes.
