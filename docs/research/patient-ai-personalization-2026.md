# Patient AI personalization: evidence and implementation choices

Research cutoff: **28 September 2026**. This is a focused primary-source review,
not a systematic review. Publication dates below are the published article dates,
not search-engine age labels or dates embedded in DOI identifiers. All eight
included studies are peer-reviewed; none is a preprint. Some publisher pages
intermittently blocked automated access, so their publisher-indexed full text and
PubMed/PMC records were also consulted.

## Decision

Prioritize **inspectable memory, easier answer adjustment, and preparation for a
care-team conversation**. Keep the existing one-tap entry points and bounded
reviewed response flow. The studies below support investigating these directions;
they do not validate this app, its agent graph, Hebrew output, insulin advice, or
an improvement in glucose outcomes.

The most important distinction is between four different results: a patient
opening a message, liking it, understanding it, and benefiting clinically. The
included studies measure different parts of that chain. They cannot be used
interchangeably.

## Eight studies that inform the decision

### 1. Adaptive messaging can help, but the tested package matters

**DIAMANTE, 8 October 2024; randomized trial.** Adults with diabetes and depressive
symptoms received adaptive messages, randomly selected messages, or weekly mood
messages. Of 195 recruited participants, 168 were analyzed: 55 adaptive, 56
random, 57 control. Over 24 weeks, model-estimated daily steps increased by 606
(19%) in the adaptive arm, versus 59 (1.6%) and 136 (3.9%) respectively. The
adaptive group's daily slope was 3.61 steps (95% CI 2.45–4.78). The system adapted
message categories and delivery time together. This supports that intervention
package, not a universal best notification time or a benefit from generative AI.
Phone step measurement, exclusions after randomization, under-recruitment, and
unknown message-reading behavior limit interpretation. It does not establish a
glycemic benefit. [Primary paper: DIAMANTE randomized clinical
trial](https://www.jmir.org/2024/1/e60834/)

**Implication:** Treat adaptation as a testable component with its own outcome,
rather than assuming any personalization improves self-management.

### 2. More app use did not mean better behavior

**myBPmyLife, 7 January 2026; micro-randomized trial** in hypertension. Notifications
were repeatedly randomized at four daily opportunities over six months; 287 of
298 intervention-assigned participants entered the analysis, covering 187,517
decision points. Physical-activity prompts did not increase steps during the next
60 minutes: ratio 1.01 (95% CI 0.98–1.04; P=.40). Dietary prompts did not improve
self-reported lower-sodium choices during the next 24 hours: ratio 0.93 (95% CI
0.83–1.04; P=.23). An exploratory analysis found 95.5% more app use in the next
hour. Participants were already fairly active; tailoring was limited, and delayed
effects could be missed. These null results concern the measured short-term
outcomes. [Primary paper](https://www.jmir.org/2026/1/e78218)

**Implication:** Keep requests user-initiated for now. Neither this study nor
DIAMANTE determines an optimal notification frequency for this app. Do not use
opens, session length, or likes as clinical success measures.

### 3. Patients asked for relevant everyday help; accuracy remained contextual

**DTalksBot, 12 November 2025; formative qualitative study.** Twenty-four patients
with diabetes asked 643 questions during structured interactions with a GPT-4
chatbot grounded in curated sources; four family medicine specialists then
reviewed conversations. Participants valued accessible answers and opportunities
to discuss everyday or sensitive concerns. Clinicians identified limitations in
personalization, contextual accuracy, and integration of current health data.
Patients often preferred clinicians for medication changes and complex,
data-specific questions. This was a short Korean study, not a randomized test of
clinical benefit or long-term engagement. [Primary paper: *Generative AI Chatbot
for Diabetes Management*](https://formative.jmir.org/2025/1/e72553)

**Implication:** Let the patient quickly state the practical constraint that makes
an answer useful. Keep observations, sources, and missing current information
visible. A fluent, source-grounded answer still needs checking against the
patient's actual context.

### 4. Co-design showed feasibility, not established efficacy

**DigiBete, 23 July 2025; prospective nonrandomized feasibility study.** Eighteen
young people/adults with type 1 diabetes were enrolled across four English
services for six weeks. Interviews included 12 young participants, parents, and
clinicians. Users described the chatbot favorably, and the work identified
refinements for transition to adult care. The system surfaced clinically approved
resources through defined conversational flows; it was not an unrestricted LLM.
Recruitment fell below the planned 32–40 participants. The small uncontrolled
sample and incomplete participation cannot establish improved HbA1c, quality of
life, or sustained use. [Primary paper: *DigiBete, a Novel Chatbot to Support
Transition to Adult Care*](https://diabetes.jmir.org/2025/1/e74032/)

**Implication:** Test the actual buttons and language with intended users,
including people who stop using the flow. Positive feedback from completers alone
is insufficient. Do not assume adult type 2 diabetes findings generalize to young
people with type 1 diabetes.

### 5. Memory increased conversation duration, with no detected satisfaction gain

**Multicall memory, 21 August 2026; retrospective observational study.** Analysis
covered 4,415 AI care-agent calls from 4,189 patients, mean age 72.1. Only 250 calls
(5.7%) used prior memories. Each referenced memory was associated with 2.47 extra
minutes (95% CI 2.03–2.91); among completed calls, the association was 0.54 minutes.
There was no statistically significant association with satisfaction or the
recommendation rating. Satisfaction was available only for completed calls.
Longer calls can themselves provide more opportunities to reference memories;
selection and confounding remain possible. Memory accuracy and clinical relevance
were not assessed. More memory is not proven to improve care. [Primary paper: *Multicall Memory
in an AI Care Agent for Chronic Care Management Among Older Adults*](https://formative.jmir.org/2026/1/e87704)

**Implication:** Optimize relevance and correctability, not the count of memories
or time spent talking. Memory should save the patient repetition.

### 6. Better knowledge did not imply greater trust

**Digital clinician, 30 July 2025; feasibility randomized trial.** Forty-three
patients beginning semaglutide for overweight/obesity received a task-specific
avatar tutorial (27) or nurse education (16). Knowledge scores favored the avatar
(median 10 versus 8; P<.001), but trust and consultation satisfaction favored the
nurse (both P<.001). Self-efficacy did not differ significantly (P=.57).
Twenty-two of 27 avatar users said they would use it in their own time. The study
was under-recruited for its planned noninferiority analysis, retrospectively
registered, had substantial two-week missing data, and used nonvalidated/adapted
measures. It studied a controlled educational flow, not open-ended medication
advice. [Primary paper: *“Digital Clinicians” Performing Obesity Medication
Self-Injection Education*](https://diabetes.jmir.org/2025/1/e63503/)

**Implication:** Measure understanding and trust separately. An appealing avatar
or a high willingness-to-use score is not justification for replacing clinician
contact or adding medication instructions.

### 7. An LLM was not superior to search for shared decision support

**Rhinology shared decision-making pilot, 15 May 2026; randomized trial.** Fifty-seven
English-speaking patients completed ChatGPT-4 (29) or Google (28) exploration of
treatment questions at one specialist clinic. Decisional-conflict scores improved
within both groups: −4.3 (95% CI −7.1 to −1.5) and −2.7 (−4.3 to −1.1), with no
significant between-group difference. Knowledge and treatment preferences did not
change; usability was comparable. ChatGPT answers received mean accuracy 7.2/10
(SD 2.0). The small, single-center, immediate-outcome study does not establish
equivalence, long-term benefit, or diabetes applicability. Within-group improvement
alone is not evidence that the LLM caused an advantage over search.
[Primary paper: *Large Language Model-Assisted Shared Decision-Making in
Rhinology*](https://pmc.ncbi.nlm.nih.gov/articles/PMC13179143/)

**Implication:** Help the patient express uncertainties and questions, rather than
presenting the AI's preferred choice as the answer to a care decision.

### 8. Structured preparation helped clinical communication in a specific setting

**PreA, 19 January 2026; randomized trial.** Across two Chinese health centers,
2,069 patients were assigned to independent chatbot preparation, staff-assisted
chatbot preparation, or no chatbot before seeing 111 specialists. Independent
PreA reduced consultation duration from 4.41 to 3.14 minutes (28.7%; P<.001).
Patient-reported communication ease increased from 3.44 to 3.99 (P<.001). The
chatbot gathered information and created a referral report for the clinician.
Results came from busy hospital referral workflows; patients knew their
allocation. Home use, sustained outcomes, and transfer to other health systems
require validation. Its diagnostic/test-ordering functions are outside this app's
recommended scope. [Primary paper: *An LLM Chatbot to Facilitate
Primary-to-Specialist Care Transitions*](https://www.nature.com/articles/s41591-025-04176-7)

**Implication:** A compact, patient-reviewed summary for an appointment is a
reasonable UX hypothesis. Do not import autonomous diagnosis, test ordering, or
prescribing from this trial into a diabetes self-management assistant.

## What is supported, and what is still a hypothesis?

| Statement | Evidence boundary |
| --- | --- |
| Some adaptive digital interventions improve a specified behavior. | DIAMANTE supports its 24-week messaging package and step-count outcome, not all personalization or glycemic efficacy. |
| Engagement metrics alone can mislead. | myBPmyLife's increased app use coexisted with null measured behavioral effects; the memory study found no detected satisfaction association. |
| Task-specific AI can help education or communication. | The digital-clinician and PreA trials support outcomes in their particular workflows. They do not validate unsupervised therapeutic recommendations here. |
| Patients value contextual, understandable help. | DTalksBot and DigiBete provide direct formative evidence, not effect estimates for a new UI. |
| Inspectable memory, an “adjust this” button, and three appointment questions will improve this app. | **Product hypotheses.** None of these exact interfaces was tested in the cited studies. |
| More agents, more retained history, or reinforcement learning from likes will improve patient outcomes. | **Not established by these studies.** No included study validates the current agent graph or learns safe clinical efficacy from thumbs feedback. |

## Fit with the current implementation

Inspected [AIRecommendations.md](../AIRecommendations.md),
[recommendationMemory.ts](../../src/services/aiRecommendations/recommendationMemory.ts),
[recommendationOrchestrator.ts](../../src/services/aiRecommendations/recommendationOrchestrator.ts),
[useRecommendationRuntime.ts](../../src/product/ai/useRecommendationRuntime.ts), and
[RecommendationPersonalization.tsx](../../src/product/ai/RecommendationPersonalization.tsx).

The app already has short requests, explicit instructions, local scoped memory,
memory disable/clear, answer-linked votes and comments, and negative-feedback
reasons for excessive length, poor relevance, and difficulty following an answer.
The orchestrator already makes one useful step the starting point and uses a
final reviewer/writer. Rebuilding these features or adding another permanent
specialist is not the next evidence-informed improvement.

At inspection, memory context includes explicit instructions, up to eight feedback
records, then up to ten recent questions, under character limits. This is bounded
and patient-originated, but mainly selected by recency rather than the current
request. The UI exposes aggregate memory counts, editable instructions, and the
actual serialized context used for an answer. It does not yet present that
context as a compact list with individual edit/forget controls.

## Three low-risk changes to implement and test

These are design proposals, not trial-proven medical interventions.

Implementation update (28 September): the optional adjustment in proposal B is
implemented, including an “already tried” reason. Feedback is saved before a
patient-requested adjustment; failed saves remain retryable, and navigation
invalidates stale adjustment callbacks. The latest correction is prioritized
over old memory at every model stage. Proposals A's per-item memory controls and
C's dedicated appointment brief remain future work.

### A. Show and correct the context used for this answer

Add a collapsed **“What I used about you” / “מה לקחתי בחשבון”** section. Show the
actual selected instructions/preferences and dated prior questions. Give each
stored item a stable identity and an edit/forget path. Clearly distinguish an
explicit preference, an old question, and current device evidence.

Select relevant memory deterministically by request focus and recency before the
existing calls. If selection cannot establish relevance, omit the old question.
Use the patient's latest explicit correction over older preference text. Do not
silently convert a historical question into a diagnosis, food restriction, or
current behavior. Changing a durable preference requires an explicit patient
action; transient constraints can remain specific to this request.

This extends `buildRecommendationPatientContext` with selected-item metadata and
exposes it through the portable runtime, so native and web stay consistent. It
does not require a memory-generating agent or additional model calls.

### B. Turn existing feedback into an optional adjustment

After negative feedback, offer **“Make this fit me” / “התאם את ההמלצה אליי”**.
Reuse the existing reasons. Optionally ask one concrete constraint using buttons:
time available, cooking access, budget, or “something else”; always allow skipping.
For excessive length, offer a shorter explanation without a questionnaire.

Pass the chosen constraint as a new patient instruction for the current request
and regenerate through the existing safety-reviewed flow. Preserve the original
answer and its feedback identity. Never treat a thumbs-up as successful glucose
control, or a thumbs-down as permission to relax a safety boundary. Do not
automatically save a one-off obstacle as a permanent trait.

This belongs in `RecommendationPersonalization` and `useRecommendationRuntime`;
the orchestrator continues to use the same evidence and two/three-call maximum.
The useful new behavior is explicit answer adjustment, not another set of rating
buttons.

### C. Produce a patient-reviewed appointment brief

In the existing care-team focus, offer **“Prepare my questions” / “הכן שאלות לצוות”**.
Use a concise layout: my stated goal, a few timestamped observations and data
gaps, and up to three questions. Let the patient correct the draft and copy it.
Exclude inferred diagnoses, treatment changes, and dose calculations. Sharing or
sending is a separate deliberate action, not an agent side effect.

This is a scoped output of the current reviewer/writer, not an additional
diagnostic agent. It gives the focused flow a concrete end product while keeping
decisions with the patient and clinical team.

## Evaluation before claiming improvement

Use representative Hebrew and English scenarios in both native and web: shift
work, limited time, conflicting old preferences, an irrelevant past question,
memory disabled, stale/missing glucose, repeated unhelpful advice, and an uncertain
patient preparing for a visit. Have intended users, including lower digital
literacy users and people who abandon the flow, test them. Keep type 1/type 2 and
age-group findings separate.

Assess completion and burden alongside understanding: can the patient explain the
one proposed step, identify what information is missing, and correct an unwanted
memory? Track request-to-useful-answer time, abandoned forms, correction effort,
latency, and whether “adjust this” resolves the stated obstacle. Ask optional
questions about fit and usefulness separately from what the person actually did.
Use consented, minimal evaluation data; do not log raw health conversations merely
to count engagement.

Retain technical checks for scope isolation, cancellation, opt-out, deletion, and
feedback replacement. Add scenario evaluation for stale evidence, unsafe dosing
requests, contradictory memories, and feedback attempting to override boundaries.
The model reviewer is a software component, not equivalent to the human clinical
review used in some studies. Clinical efficacy or safety claims would require a
separate prospective evaluation with appropriate clinical oversight and outcomes.

## Search limits

Searches covered patient-facing conversational AI, diabetes self-management,
cross-conversation memory, shared decision support, and adaptive messaging during
2024–2026. Trials, empirical qualitative work, and direct publisher/PMC records
were prioritized. Earlier frequently cited studies, such as the 2023 basal-insulin
voice-AI trial, were excluded from the eight-study set; treatment titration is
also outside this implementation scope. Reviews, registrations without outcomes,
and vendor announcements were not counted as efficacy studies. This review did
not establish an evidence-based best number of agents, questionnaire steps, stored
memories, notification frequency, or a validated medical learning rule from likes.
