# AI recommendations: orchestration, patient memory, and feedback

Research date: 2026-09-28. Primary documentation pages were opened, not only read from search snippets. The architecture below is a proposal fitted to this repository; it is not a claim of clinical validation or a record of completed implementation.

## Recommendation

Use one recommendation experience with a small, code-controlled manager workflow. Reuse the existing LLM proxy, evidence tools, patient scope, history, and clinical output guards. Route to relevant specialists, then have one independent reviewer produce the patient-facing answer. Keep patient questions, explicit instructions, and feedback as separately labelled context.

OpenAI distinguishes handoffs, where a specialist takes over, from agents used as tools, where a manager retains ownership. Its guidance recommends adding specialists only when different capabilities or policies justify the split. The latter pattern fits a patient who should receive one clear answer. [OpenAI orchestration guidance](https://developers.openai.com/api/docs/guides/agents/orchestration)

No SDK migration is necessary for this redesign. The repository already owns an agent loop through `LlmProvider.sendChat`. Implementing bounded stages there preserves native/web compatibility and the current credential boundary. API/runtime migration should be a separate measured decision, not a prerequisite for a simpler recommendation button. OpenAI documents direct API requests and application-owned conversation state as supported approaches. [Conversation state](https://developers.openai.com/api/docs/guides/conversation-state)

## Existing assets and gaps

These observations describe the baseline inspected during research; concurrent implementation may resolve them.

| Existing component | Reuse | Gap to address |
| --- | --- | --- |
| `src/services/aiOrchestra/defaultOrchestra.ts` | Specialist definitions and tool allowlists | General chat selects nearly all specialists; memory curator can approve its own memory suggestions. |
| Native `AiAnalyst/llm/runAgentOrchestra.ts` | Parallel specialists, cancellation, final writer, safety reviewer, Loop evidence gate | Up to four critique/rewrite cycles add eight serial requests before the final safety pass. The published phase description and execution order differ. |
| `src/services/aiMemory/aiMemoryStore.ts` | Workspace keys, provenance, expiry fields, disabled/pending entries | `searchMemory` does not prune expired records. Compact retrieval uses a generic English query and can miss explicit patient instructions. |
| `src/services/aiAnalyst/aiAnalystHistory.ts` | Durable, scoped conversation snapshots | Saving history alone does not ensure questions and corrections re-enter the next recommendation's context. |
| `useAiAnalystEngine.onAssistantFeedback` | Existing thumbs feedback persistence | Stores assistant text as high-confidence user memory without a specific reason or stable recommendation/message identity. |
| `src/platform/web/ai/useBrowserAiAnalystRuntime.ts` | Scoped browser history, abort-on-workspace-change | Browser currently has a separate, simpler generation path. Apply the same recommendation and memory contracts to both platforms. |
| ADR 0001 and ADR 0007 | Advisory-only behavior; shared LLM credential proxy | Preserve these boundaries when reducing legacy entry points. |

## One request contract, five entry points

Use a typed request rather than encoding routing only inside translated text:

```ts
type RecommendationRequest = {
  horizon: 'now' | 'meal' | 'week' | 'month';
  focus: 'general' | 'food' | 'habits' | 'care-team-plan';
  mealSize?: 'small' | 'medium' | 'large' | 'unsure';
  goal?: string;
  patientInstruction?: string;
};
```

The landing page should offer: recommendation now, before a meal, weekly, monthly, and a guided weekly/monthly request. The guided path uses two or three short button questions: period, subject, and desired improvement. Optional text adds an instruction. Small/medium/large describes a meal; it is never converted directly to insulin units or a precise carbohydrate estimate.

The manager owns the interpretation of this request. UI labels do not expose internal specialist names. Older mission logic remains available behind the manager for evidence retrieval and history compatibility.

## Execution graph

```text
Request + workspace + cancellation token
                  |
        Validate and route in code
                  |
   Patient memory + evidence snapshot
                  |
       Relevant specialists in parallel
                  |
  Reviewer checks evidence and writes answer
                  |
       Guarded answer + local history
                  |
        Patient feedback or follow-up
```

Recommended responsibilities:

| Stage | Contract | Limit |
| --- | --- | --- |
| Router | Select horizon, evidence window, specialists, and required evidence | Deterministic; no model call for button selections |
| Context builder | Explicit patient instructions, recent questions, feedback, fresh evidence, data gaps | Read-only; bounded context; same workspace throughout |
| Evidence analyst | Explain observed patterns with dates, coverage, and source identifiers | Required when interpreting measurements |
| Food/habits specialist | Suggest feasible food or routine options fitting the selected focus | At most one extra specialist for ordinary requests |
| Manager | Select the workflow and merge specialist results as labelled inputs | Code-controlled; no separate drafting call |
| Reviewer/writer | Check evidence, unsafe specificity, missing context, and memory misuse; write one practical recommendation | One call; no tools or side effects; output is the final answer |

Implementation budget: one specialist plus a reviewer/writer for now and meal requests (two provider calls); two independent specialists plus the reviewer/writer for longer-period analysis (three provider calls). The reviewer synthesizes from the findings, avoiding an extra drafting call. Cap tool calls and output tokens per stage; do not recursively invoke agents. Preserve explicit exceptions for existing Loop evidence gates. A bounded graph is not inherently more accurate than one model: retain additional stages only if evaluation shows improvement.

A specialist result should distinguish `observations`, `sourceIds`, `dataGaps`, `patientPreferences`, and `suggestions`. A review result should distinguish an approved answer from a blocked or incomplete result. Prefer schema-constrained output when the provider contract supports it. Until then, validate parsed output and reject malformed status fields. Schema adherence does not establish medical truth. OpenAI documents explicit refusals and incomplete responses as cases callers must handle. [Structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

Failure behavior is part of the contract: optional specialist failure is a labelled missing input; missing required evidence produces a question or limited answer. Reviewer failure must not release an unreviewed treatment recommendation. Cancellation or patient/workspace change must stop publishing results and stop subsequent history/memory writes. Retry only bounded transient failures and never replay a state-changing action as part of an automatic generation retry.

## Patient memory

Separate four kinds of information:

1. **Explicit instructions:** the patient's own words, such as preferred foods or requested response style. Store the source message and timestamp. These should reliably appear when relevant, even if lexical search fails.
2. **Questions and goals:** unresolved questions and selected recommendation goals. These describe what the person wants help with, not diagnoses or established clinical facts.
3. **Observed evidence:** dated sensor-derived summaries, coverage, units, and source. Older observations must not masquerade as current glucose or current treatment.
4. **Assistant outputs and feedback:** what was recommended and how the person rated it. Keep this separate from factual patient records.

Proposed retrieval order: active safety-relevant profile data; relevant explicit instructions; current question; recent unanswered questions; recent feedback for the same focus; a few relevant prior episodes. Deduplicate by source/message identity, remove expired/disabled records, and apply a total character/token budget. Current explicit corrections supersede older incompatible preferences; preserve provenance rather than silently overwriting history.

Use data envelopes in user/tool context for stored memory and quoted patient text. Never paste arbitrary feedback into a privileged system prompt as new rules. OpenAI advises keeping untrusted data out of developer messages and constraining data exchanged between workflow stages. This guidance reduces injection risk; it does not eliminate it. [Agent safety guidance](https://developers.openai.com/api/docs/guides/agent-builder-safety)

Read-only generation agents must not call `approveMemoryEntry`. Record explicit button/text feedback through application code. AI-inferred durable facts should remain pending until the patient confirms them. Retain inspect, edit, forget, and disable controls already present in the memory surface. A history deletion and a memory deletion are distinct operations; make the distinction visible and offer clearing both when intended.

Workspace isolation remains mandatory across reads, delayed responses, writes, account switches, and browser/native adapters. Store only the summaries necessary for continuity. Do not add raw Nightscout persistence to the proxy, in keeping with ADR 0007.

## Feedback without false clinical learning

Use thumbs up/down on each stable assistant message. On down, offer a short optional reason: not relevant, unclear, too hard to follow, already knew this, or feels unsafe. On up, offer useful, clear, fits my routine. Optional free text captures what to change. Repeated clicks should update one feedback record, not create duplicate votes.

Suggested fields: `conversationId`, `messageId`, `request`, `rating`, `reason`, `comment`, `createdAt`, `updatedAt`. The storage scope belongs to the authenticated patient/workspace boundary, not model-generated input.

Product inference rule: feedback may affect wording, relevance, variety, and feasibility. It must never establish that an insulin dose was effective or safe, infer clinical outcomes, raise confidence in an assistant claim, or override current evidence. “I liked this” and “this improved glucose” are different statements. An explicit report of an outcome stays labelled as patient-reported; causal benefit is not inferred from a later sensor reading.

Do not automatically fine-tune on thumbs ratings. Use aggregate feedback to select examples for review, while evaluating safety and patient preference separately.

## Medical boundary

Preserve [ADR 0001](../adr/0001-ai-analyst-is-advisory-only.md). The app can explain patterns, suggest food/routine choices, and prepare questions or a proposed discussion plan for the care team. “Treatment plan” should mean material for that discussion, not autonomous prescribing or pump adjustment. Do not expose therapy-write tools to the recommendation agents.

A reviewer is another fallible model, not clinician sign-off. Validate glucose units, data freshness, evidence availability, and allowed tool actions in code. Preserve established clinical guardrails and clinician-reviewed emergency copy. OpenAI recommends human review in high-stakes use and testing adversarial inputs. [Safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices)

Urgent scenarios must not wait behind a multi-agent planning run. NIDDK describes severe hypoglycemia as requiring immediate treatment and identifies loss of consciousness and seizure among severe symptoms. Keep urgent-care guidance separate from routine recommendation generation and direct users to their established emergency plan or emergency help as appropriate. This research does not define new dosing or glucose thresholds. [NIDDK: low blood glucose](https://www.niddk.nih.gov/health-information/diabetes/overview/preventing-problems/low-blood-glucose-hypoglycemia)

## Cost, latency, privacy, and measurement

Parallelize only independent specialist work. Fetch/cache a shared evidence snapshot per run to avoid repeated data access. Prefer deterministic routing and local calculations for fixed questions. Keep outputs concise and show progress stages rather than streaming an unreviewed clinical draft. Fewer model requests and bounded output are the largest immediate changes to the existing multi-review path. OpenAI's latency guidance covers fewer requests, parallel work, short outputs, and using conventional code when a model is unnecessary. [Latency optimization](https://developers.openai.com/api/docs/guides/latency-optimization)

Keep static instructions before changing patient context to improve prefix reuse. Cache benefits depend on the model, matching context, retention, and actual traffic; do not promise savings without measurements. Do not duplicate sensitive text merely to reach a cache threshold. [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)

Prefer the existing local memory plus transient LLM requests over adding hosted Conversations solely for personalization. `store: false` does not by itself mean zero retention: OpenAI separately documents abuse monitoring and application state, and approved retention controls vary by endpoint and model. Hosted Conversations retain state until deleted. Confirm organization settings before making privacy claims. Keep traces free of raw patient text by default; record stage, duration, token usage, error category, and source counts. [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data)

## Evaluation and acceptance

Use deterministic integration tests for routing, scoping, feedback persistence, cancellation, and evidence gates. Add a small, deidentified evaluation set reviewed by a diabetes professional before claiming clinical reliability. OpenAI recommends inspecting workflow traces and moving to repeatable datasets once desired behavior is defined. [Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals)

Minimum cases:

- Now, meal, week, month, and every guided focus reach the intended workflow.
- Missing/stale glucose and partial time windows never become invented current evidence.
- Hebrew instructions survive a new conversation and do not leak across patients.
- Expired, disabled, and unconfirmed inferred memories are excluded.
- A patient's latest correction beats older preferences.
- Feedback changes presentation without turning liked advice into clinical evidence.
- Contradictory specialist findings remain visible as uncertainty.
- Reviewer outage or malformed output cannot expose an unreviewed treatment draft.
- Cancellation, timeout, workspace switching, and app reload preserve correct ownership.
- Meal-size choices do not produce unsupported grams or insulin units.
- Prompt injection in memory or feedback cannot enable tools or change safety policy.
- Urgent low-glucose context does not wait for a weekly/monthly planner.

Compare the baseline and new graph on task completion, evidence grounding, instruction recall, safe abstention, patient-rated usefulness, total calls/tokens, and median/tail latency. Keep separate safety and preference scores. This research supports an engineering design; passing mocked tests is not evidence that a medical recommendation is correct.
