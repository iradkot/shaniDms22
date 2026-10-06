# Product feedback and priorities

Updated: **2026-10-06**. This is the working backlog for the ShaniDms pilot.
Priorities reflect recorded feedback and Irad's decisions, not commitments made
by volunteers. This public-facing document contains anonymized product ideas.
Names, contact details, correspondence and message identifiers stay in local
operational records under the Git-ignored `artifacts/` directory.

## Product direction and current boundary

Irad's goal is to improve a diabetes management app with user feedback and,
over time, develop personalized AI that understands a person's habits and
patterns. There is no profit motive now or later. This is a personal project;
it is not described as a registered nonprofit.

The current pilot is Android, in English and Hebrew, with read-only Nightscout
access, charts, trends, a manual meal/activity journal and retrospective event
review. It does not control a pump or change AAPS. The pilot is for usability
and reliability feedback, is not clinically validated, and is not intended for
treatment or dosing decisions. Long-term personalized explanations are a
development direction, not an established benefit of this pilot.

## Recorded feedback

Private source attribution is retained locally by the F-identifiers below.
Do not add participant names, quotations or correspondence identifiers here.

| ID | Date | Feedback and implication | Basis |
| --- | --- | --- | --- |
| F01 | 2026-10-04 | Existing tools already show much of the same data. Validate whether focused meal/hypo review saves work beyond another set of charts. | Private technical feedback; local source F01. |
| F02 | 2026-10-04–05 | An interested reviewer was blocked by Android eligibility and saw overlap with existing iPhone views. Make platform fit clear; a single response does not justify an iOS release. | Private usability feedback; local source F02. |
| F03 | 2026-10-05 | Clarify what AI explanations provide and how the approach differs. The proposed value is an explanation tied to actual event records, with missing context and uncertainty visible. This is a product hypothesis to evaluate. | Private technical feedback; local source F03. |
| F04 | 2026-10-05 | Use concrete feedback tasks covering UI, usefulness of event review and context needed for AI. Interest in reviewing an idea does not establish beta enrollment or a commitment to develop. | Private developer feedback; local source F04. |
| F05 | 2026-10-05 | Evaluate automatic activity import and the relation between IOB, meals and model inputs. Initial code inspection found a missing manual activity input in dedicated hypo review. The implementation uses an existing model with selected records and tools, not a custom-trained diabetes model. MetaboNet is a research lead only. | Private technical feedback plus local code inspection; local source F05. |
| F06 | 2026-10-05 | Engineering follow-up found that a combined Meal Bolus record contributed insulin but lost its carbohydrate amount in hypo context. A failed glucose read could also appear as an empty history. These are implementation findings. | [Context builder](../src/services/aiAnalyst/hypoDetectiveContextBuilder.ts) and [synthetic regressions](../__tests__/hypoDetectiveContextBuilder.test.ts). |
| F07 | 2026-10-05 | Compare how other tools present meal context and AI explanations. Ask Roo is a comparison lead; distinguish official descriptions from observed behavior and clinical validation. | Private developer feedback; local source F07. Public product reference: [Gluroo](https://gluroo.com/). |
| F08 | 2026-10-05 | Make source availability and reuse permissions clear. The repository is public, but no open-source license is currently present. A question about source status alone does not establish interest in developing. | Private technical question plus a fresh repository check; local source F08. |
| F09 | 2026-10-06 | Recruitment visuals should show concrete workflows: AGP, expanded glucose/context graph, low-event investigation and retrospective chat. Prefer a small relevant pair over summary-only images. Use real components and disclose synthetic data and authored demo responses. | Project-owner feedback and fresh local captures; local source F09. |
| F10 | 2026-10-06 | The AGP and Daily Patterns destination exposed hourly percentile cards and daily profiles, but lacked the aggregate AGP plot. Invitation previews assembled from other components did not establish that this destination included the chart. | Project-owner report, reproduced by mounting the actual destination with synthetic samples. |

Dates identify feedback or inspection, not a clinical study or release date.
Statements about current code do not prove behavior of a subsequently installed APK.

## Prioritized backlog

P0 unblocks a usable private pilot. P1 improves the value of that pilot. P2
requires further demand, scope or evidence. Within each priority, work from
the top down. A candidate is done only when its acceptance condition is met.

| ID / priority | Status | Action and acceptance condition | Next action / basis |
| --- | --- | --- | --- |
| B01 / P0 | Open; volunteer delivery unverified | Establish a private installation path for consenting volunteers. Confirm the exact APK, recipient access, compatible device, install/upgrade and launch. An authenticated developer download is not evidence of volunteer access. | Test a recipient-specific delivery path without publishing a private object or bucket. Keep delivery evidence local. |
| B02 / P0 | Open; complete volunteer guide missing | Make consent and setup understandable in both languages: platform eligibility, optional cloud/AI choices, a clear way to continue locally, read-only Nightscout setup, and a recoverable connection failure. A fresh adult volunteer can complete the flow without sharing credentials in correspondence. | Write and try the installation/setup steps against the current artifact and a disposable account; record confusing steps. Use current verified onboarding facts and [read-only setup](NIGHTSCOUT_READ_ONLY_PILOT.md). |
| B03 / P1 | Implemented locally; release pending | Dedicated native hypo review now includes up to ten structured journal activities per event from a 24-hour lookback, labeled self-reported. Missing journal data differs from no matching logs. Account/source changes reject in-flight context. Notes, tags and external payloads are excluded; timing is not causal evidence. | Focused synthetic tests verify local journal reads, overlap, unknown end times, empty/unavailable context, bounds, privacy and account/source changes. Both mission and tool callers use the same scoped builder. F05. Automatic activity import is separate B06; this source change is not an APK release. |
| B11 / P1 | Implemented locally; release pending | Count insulin and carbs independently for a combined Meal Bolus; use the shared timestamp parser. Reject failed glucose reads instead of treating them as a known-empty event history. | The builder regression checks a combined record contributes to both summaries and failed CGM reads reject. F06. |
| B04 / P1 | Open | Make retrospective answers inspectable. Distinguish measured glucose, recorded insulin/carbs and reported IOB/COB; show the record/time window behind a claim, gaps and uncertainty. Accept when a synthetic incomplete event yields a grounded description without invented context or causal certainty. | Choose synthetic review tasks and inspect current answers/UI before deciding what to change. F03, F05; [journal outcome guardrails](research/journal-outcome-analysis.md). |
| B05 / P1 | Open; feedback interest recorded | Test differentiated value with concrete tasks: find a past event, understand its timeline, identify missing context, and compare the effort with existing tools. Record observed usability problems and the participant's assessment; do not equate satisfaction with clinical benefit. | Offer these tasks to willing reviewers once B01/B02 allow a practical try. Confirm Android suitability and agreement first. F01–F04; feedback interest alone is not enrollment. |
| B13 / P1 | Prepared and visually reviewed locally | Prepare focused pilot invitation images in Hebrew and English. Eight captures now show AGP, an expanded daily graph, a selected low event with nearby records, and retrospective chat. Default pair is AGP plus low-event investigation; choose chat or expanded graph for relevant interests. | F09. Local packet v2 stores capture provenance and pixel-preserving PNG conversion evidence. Chat text is an authored demonstration. This is invitation material, not latest-APK verification or evidence of clinical benefit; preserve no-duplicate outreach records. |
| B14 / P1 | Included in private pilot APK; verified locally | AGP and Daily Patterns now includes a real 24-hour percentile plot above individual days. It uses the loaded period, supplied target thresholds and local clock-hour buckets; missing-hour gaps, quality messages and accessible hourly values remain visible. Hebrew numeric ranges retain their direction. | F10. The missing-chart regression now passes through the actual screen and Android destination. 111 focused tests, native/web typechecks and web build pass; synthetic mobile/tablet previews were reviewed. The final pilot APK was built, inspected and emailed privately to the project owner. Real-device display with a user's data remains unverified. |
| B06 / P2 | Deferred; scope/privacy undecided | Consider opt-in Android activity import through Health Connect. Decide which fields are useful, permission/retention behavior, duplicate handling and manual correction before implementation. Accept only after the scope, privacy disclosures and a reversible denied-permission flow are agreed and tested. | Check current primary platform documentation and assess whether manual journal feedback justifies an integration. F05; no import currently promised. |
| B07 / P2 | Direction agreed; design pending | Develop long-term personal context for retrospective AI. Users must be able to inspect, correct and delete remembered context; source, date and uncertainty must survive retrieval. Keep recommendations inside the pilot's treatment/dosing boundary. | Define a narrow memory use case and user controls before expanding collection. F03/F04 and [personalization research](research/patient-ai-personalization-2026.md); no proven glucose benefit. |
| B08 / P2 | Research lead only | Evaluate MetaboNet for relevance to retrospective event review. Record its primary source, provenance, intended use, license and limitations before proposing data/model use. | Ask for clarification if the resource cannot be identified reliably. F05. No dataset, license or model has been adopted. |
| B12 / P2 | Comparison lead only | Review Ask Roo with the same synthetic past-event questions used for B05. Compare context, evidence and uncertainty; keep announced or unavailable features separate from observed behavior. | Start with current official documentation and a no-patient-data comparison if access is available. F07. No account creation, paid subscription or copied implementation is authorized by this entry. |
| B09 / P2 | Public visibility retained by Irad; cleanup on hold | The repository stays public by Irad's explicit decision on 2026-10-05. A planned open-source release, license decision and historical credential cleanup remain separate work. Clarify the current source and license status when reviewers ask. | F08. Choose a license when source-release work is authorized. Revisit [the credential/history runbook](SECRET_ROTATION_AND_HISTORY_REWRITE.md) if cleanup is authorized. Do not change visibility, rewrite history or claim it has been cleaned from this backlog entry. |
| B10 / P2 | Demand validation only | Reconsider an iOS pilot if enough interested reviewers are blocked by Android eligibility. Accept a platform decision only with recorded demand, support/release scope and an installation plan. | Track volunteered platform fit; do not re-recruit someone who declined. F02. No iOS delivery promised. |

## Collaboration and source access

Irad confirmed on **2026-10-05** that the repository should remain public.
A developer may join development after a short conversation and his approval.
Record explicit interest and the outcome of that conversation before requesting
write access. Reviewing an idea does not imply a commitment to develop.

Public visibility is not a claim that the planned source-release preparation
or history cleanup is complete. This backlog does not authorize repository
access changes or history rewriting.

## Updating this backlog

For useful new feedback, add a dated, anonymized F-item and keep source
attribution in local operational records. Keep names, contact details, copied
correspondence, message identifiers, credentials and personal health records out
of this public file. Map the idea to an existing B-item or explain a new priority.
Mark completed work with its changed behavior and focused validation; keep
untested installation and clinical claims explicit. Preserve declined
participation and avoid inventing commitments from expressions of interest.
