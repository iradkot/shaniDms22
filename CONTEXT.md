# ShaniDms

ShaniDms helps people inspect and understand diabetes data obtained primarily from an external Nightscout source, together with information created inside ShaniDms.

## Quality priorities

**Developer Experience and Extensibility**:
A top-priority quality attribute for the rewrite. Adding or improving a Module, stable destination, AI Specialist, metric, source adapter, platform adapter, or Runtime Plugin should be a local change behind a small Interface, with typed registration, atomic runtime validation, focused tests, and no repeated navigation or capability switches across callers.
_Avoid_: DX as tooling only, Premature generalisation

## Language

**Product User**:
An authenticated person using ShaniDms. A Product User may be the Data Subject, a parent, another caregiver, or a clinician.
_Avoid_: Patient, when referring to every person who can use the product

**Data Subject**:
The person whose diabetes data is being viewed or analysed.
_Avoid_: User, Patient

**Relationship to Data Subject**:
Optional Workspace metadata with the choices Self, Parent, Caregiver or Family Member, Clinician, Other, and Prefer Not to Answer. It may influence wording, AI tone, and the editable layout initially suggested by onboarding, but it does not grant access, permanently hide capabilities, or change clinical conclusions.
_Avoid_: Role, Permission level

**Nightscout Source**:
The primary external source of diabetes data shown and analysed by ShaniDms. Permission to access it is established outside ShaniDms.
_Avoid_: ShaniDms database, Patient account

**App-Owned Data**:
Information created and managed inside ShaniDms, such as meal records, activity records, and notification configuration. It is distinct from data obtained from a Nightscout Source.
_Avoid_: Nightscout Data

**Workspace**:
An isolated working context that connects a Product User to one Nightscout Source and its Data Subject. A Product User may have multiple Workspaces, but only one is active at a time.
_Avoid_: Profile, Patient account

**Journal Entry**:
An item of App-Owned Data that records user-provided context at a point or interval in time. Meal Entries and Activity Entries share its identity and timing concepts but remain separately managed kinds. A Journal Entry is private to the Product User and Workspace that own it, even when another Product User connects to the same Nightscout Source.
_Avoid_: Common Event, Notification

**Journal Conflict**:
An unresolved concurrent change to the same Journal fact, including a delete-versus-edit race. Independent field changes merge automatically, while conflicting variants remain recoverable until the Product User resolves them.
_Avoid_: Last write wins, Sync failure

**Journal Trash**:
The recoverable state of a soft-deleted Journal Entry for 30 days. After expiry its entry and media are permanently removed, while only the minimal deletion marker needed to synchronise that removal may remain.
_Avoid_: Archive, Permanent delete

**Meal Entry**:
A Journal Entry describing a real-world eating occasion with meal-specific information such as carbohydrates, name, image, notes, and tags. It may begin as a minimal capture. V1 may explicitly link up to two distinct external records—normally one External Carb Record and one Supporting Treatment—without merging them; additional distinct source records remain separate and visible.
_Avoid_: Nightscout carb treatment

**Meal Image**:
An App-Owned image attached to a Meal Entry and available locally as soon as it is captured. Optimised copies synchronise for other devices, while storing or synchronising the image never by itself authorises AI analysis.
_Avoid_: AI input, Nightscout image

**Comparable Meal Set**:
A Product User-adjustable selection of Meal Entries matched by disclosed facts such as name, template, tags, and carbohydrate range, subject to Event Outcome quality gates. It is not an unexplained AI grouping.
_Avoid_: Similarity score, AI cohort

**Activity Entry**:
A Journal Entry containing activity-specific information such as activity type, duration, and intensity. It may represent an activity that is still in progress and completed later.
_Avoid_: Sport item

**Activity Category**:
A stable analytical category such as walking, running, cycling, strength, swimming, sport, or other. A Product User may add a custom display name and tags without replacing the stable category.
_Avoid_: Free-text activity type, Fixed display name

**Ongoing Activity**:
An Activity Entry with a start but no recorded end. V1 permits at most one per Product User and Workspace, and it remains open until the Product User explicitly finishes it.
_Avoid_: Inferred workout, Running timer

**Concurrent Ongoing Activity Conflict**:
The temporary state created when separate offline devices each start an Ongoing Activity for the same Product User and Workspace. Both entries remain intact until the Product User explicitly resolves which activity remains ongoing and how the other ends.
_Avoid_: Last activity wins, Automatic ending

**External Event Link**:
A read-only App-Owned association explicitly confirmed between one Journal Entry and an existing record from its Nightscout Source. V1 keeps at most two such links on an Entry. Each external record may belong to at most one same-kind link; source unavailability never deletes the local entry, and local and external identities and values remain distinct.
_Avoid_: Imported Event, Nightscout copy, Two-way sync

**External Carb Record**:
A distinct Nightscout record containing a carbohydrate amount and timestamp. It may represent a Loop carb entry, rescue carbohydrates, or another source event; proximity or equal values prove neither duplication nor a shared Meal Entry.
_Avoid_: Meal Entry, Meal group

**Carb Purpose**:
The explicit classification of an External Carb Record as Meal-related, Low Treatment, or Unknown. ShaniDms may suggest a purpose but does not assign one automatically from glucose, timing, or source metadata.
_Avoid_: Inferred meal, Automatic rescue classification

**Meal Carbohydrates**:
The carbohydrate amount the Product User records as a fact about the real-world Meal Entry. It remains unknown when not provided and is never silently replaced by an external value.
_Avoid_: Reported Carbohydrates, COB

**Reported Carbohydrates**:
The inspectable derived total of the distinct External Carb Records explicitly linked to a Meal Entry. It describes what was recorded externally for Loop context, not necessarily what was eaten.
_Avoid_: Meal Carbohydrates, Merged treatment

**Supporting Treatment Link**:
An explicit External Event Link that associates a bolus, correction, or other treatment with a Journal Entry as context. The treatment keeps its own identity and never contributes to Reported Carbohydrates.
_Avoid_: Meal bolus, Automatic time match

**Duplicate External Record**:
The same source record received more than once under the same Nightscout Source and stable external identity. Similar time, carbohydrate amount, or content is not sufficient evidence of duplication.
_Avoid_: Nearby record, Similar meal

**Unidentified External Record**:
An external source record for which ShaniDms cannot establish a stable identity. It may be viewed or used to prefill a local entry, but it cannot form a durable live link or be merged automatically with another record.
_Avoid_: Fingerprinted identity, Duplicate External Record

**Meal Start**:
The Product User's best record of when eating actually began. Meal outcome windows are anchored to it, even when carbohydrates were announced to Loop earlier or later.
_Avoid_: External Carb Time, External Entry Time, Treatment timestamp

**External Carb Time**:
The time assigned to an External Carb Record as the time of its carbohydrates. It may differ from both Meal Start and the time at which the external entry was saved.
_Avoid_: Meal Start, External Entry Time

**External Entry Time**:
The time at which the external source says an External Carb Record was created or saved, when available. It describes logging timing and does not necessarily represent when eating began.
_Avoid_: Meal Start, External Carb Time

**Source Hint**:
An unverified display attribution inferred from fields such as `enteredBy` together with compatible event metadata. It may help explain provenance but never proves client identity, establishes access, or determines duplication.
_Avoid_: Verified source, Identity claim

**Timeline Item**:
A unified chronological presentation of one or more linked source records. Linking records into a Timeline Item does not merge their identities or obscure their sources.
_Avoid_: Stored Event

**Event Outcome**:
A descriptive view of glucose before, during, and after a Meal Entry or Activity Entry, with explicit observation windows and data coverage. It is neither a grade nor a claim that the entry caused the observed glucose response.
_Avoid_: Event Score, Causal Effect

**Meal iAUC0–2h**:
The versioned advanced Meal metric representing only the positive glucose area above the Meal Start level during the first two hours, when data coverage is sufficient. It exposes its formula and units, does not subtract below-baseline area, and is neither a hero metric nor a score.
_Avoid_: Meal Score, Net iAUC, Daily iAUC

**Repeated Observation**:
A comparison across sufficiently complete and comparable Event Outcomes that exposes its sample size, date coverage, and variation. It is evidence of a recurring observation, not a proven personal rule.
_Avoid_: Personal Rule, Prediction

**Overlapping Context**:
Another meal, carbohydrate treatment, rescue treatment, correction, activity, or material data gap that makes an Event Outcome unsuitable for a default Repeated Observation. The outcome remains available for individual inspection.
_Avoid_: Invalid Event, Deleted Event

**Hub**:
The default navigation surface from which a Product User opens focused Modules. In V1 its sections appear in the fixed order Current Snapshot when enabled, Favorites, Recents when enabled, and All Modules. It is not inherently a live-status dashboard and may be replaced as the normal start destination by user preference.
_Avoid_: Home screen, Dashboard

**Current Snapshot**:
An optional compact Hub preview containing current glucose, trend arrow, data age, IOB and COB when available, and a clear stale or offline state. It is hidden by default when onboarding is skipped and opens the Day Graph Module at the current point in time. It is not a mandatory or universally critical header and does not contain a mini-chart or AI recommendation.
_Avoid_: Critical status, Live Status Module

**Module**:
A focused product area available from the Hub, such as trends, daily review, or AI analysis.
_Avoid_: Tab, Tile, Screen

**Module Registry**:
The extensible catalogue of Modules available to the Hub and navigation shell. The initial registry contains Day Graph, Daily Overview, Previous Day Summary, Trends, Hypo Investigation, Similar Events, Loop Changes and Impact, AI Analyst, Meals, Activity, Update Center, Alert Rules, and Settings. All Modules groups them under Today, Understand, Ask, Record, Updates, and Manage; these groups do not vary by Product User relationship.
_Avoid_: Fixed tab list, Screen registry

**Product Destination Registry**:
The catalogue that combines core and Runtime Plugin contributions into the destinations available to Hub, internal Hubs, Favorites, start destinations, shortcuts, and deep links. It describes navigation ownership and availability, not the domain behaviour behind a destination.
_Avoid_: Screen switch, Domain registry, Plugin sandbox

**Runtime Plugin**:
A versioned contribution installed into an explicitly declared Extension Point of the Product Destination Registry. In V1 it is first-party and identifies an approved platform implementation through a signed typed manifest; it is not arbitrary downloaded code.
_Avoid_: Arbitrary script, Feature flag

**Extension Point**:
A location explicitly exposed by an owning Module where an approved Runtime Plugin may contribute a destination. A Plugin cannot mount into a Module that did not declare the Extension Point.
_Avoid_: Global callback, Unrestricted injection

**Capability Grant**:
Explicit permission for one Product User and Workspace to let one versioned Runtime Plugin from one publisher request a named class of data or host-owned action. It never exposes credentials or unrestricted storage access and can be revoked independently of uninstalling the Plugin.
_Avoid_: Account permission, Credential delegation

**Module Tile**:
The compact Hub control that opens a Module. It contains a name, a short explanation, and optionally a small operational badge such as an update count, pending sync, or stale-data state. Medical metrics remain inside the owning Module, and the tile does not embed a miniature analytical dashboard or chart.
_Avoid_: Widget, Dashboard card

**Hub Customisation**:
The discoverable V1 surface opened from a visible Hub action or by long-pressing a Module Tile. It edits the current Layout Profile, supports preview and reset, and does not require visiting Settings.
_Avoid_: Hidden settings, Free-form dashboard builder

**Diagnostics**:
A developer-oriented Settings area that preserves technical exports and debugging information without exposing them in normal data, summary, or AI flows.
_Avoid_: User report, Daily summary

**Day Graph Module**:
The factual view of a selected day, including its glucose graph, timeline, treatments, Journal Entries, and relevant current context.
_Avoid_: Daily Review, Home

**Daily Overview Module**:
The factual metrics for a selected day, including TIR, averages, extrema, insulin totals, and basal-versus-bolus distribution.
_Avoid_: Day Graph Module, Previous Day Summary Module

**Previous Day Summary Module**:
The interpreted retrospective for the day that has just ended. It separates the night that led into the day, the daytime period, and the night that closed the day, so its evidence window exceeds 24 hours. The opening night is context and is not counted twice in aggregate comparisons or an optional Daily Score. The summary becomes complete after the closing night ends. It includes comparisons, insights, meal outcomes, and a suggested focus, while full meal analysis remains in Meals.
_Avoid_: Morning Brief, Daily Overview Module, Trends Module

**Morning Brief**:
A forward-looking generated update intended to prepare the Product User for the current day. It may link to the Previous Day Summary but is not the retrospective itself.
_Avoid_: Previous Day Summary, Daily Overview

**Trends Module**:
Multi-day and period-level analysis presented as an internal Hub with three primary destinations: Trends Overview, AGP and Daily Patterns, and Period Comparison. Hypoglycaemia links to the Hypo Investigation Module, while Therapy Context is a secondary destination shown only when its source data is sufficiently reliable.
_Avoid_: Previous Day Summary Module, Similar Events Module

**Trends Overview**:
The concise period summary containing data coverage, the five glucose range bands, mean glucose, GMI, CV, a neutral matched-period delta, and a link from low exposure to Hypo Investigation.
_Avoid_: Daily Overview Module, Daily Score

**AGP and Daily Patterns**:
The stable Trends destination that pairs the standardized 24-hour AGP aggregate with the individual daily profiles that explain exceptions and data gaps. It may be pinned directly as a Favorite Destination.
_Avoid_: Typical day, Prediction

**Period Comparison**:
The stable Trends destination that compares equal-duration periods using identical thresholds and visible coverage, with neutral language that does not claim causation.
_Avoid_: Settings impact, Causal analysis

**Therapy Context**:
A secondary Trends destination for insulin, carbohydrates, meals, activity, AID availability, and observed Open-versus-Closed Loop outcomes. It is available only when source classification and coverage pass explicit quality checks.
_Avoid_: Treatment recommendation, Causal conclusion

**Glycemia Risk Index (GRI)**:
The published multi-day composite of low and high glucose exposure. In V1 it is an advanced Trends metric calculated only over an adequate period, labelled GRI, and shown with its separate low and high components. It is not adapted into a Daily Score.
_Avoid_: Daily Score, Health score

**Similar Events Module**:
The capability previously named Oracle. It starts from a specific event and compares it with historically similar situations and outcomes. Selecting an event focuses it immediately and starts analysis in the background without blocking the view; progress and cancellation remain available.
_Avoid_: Prediction, Trends Module

**Loop Changes and Impact Module**:
The focused history of Loop setting changes and their measured before-and-after impact. It does not apply therapy changes.
_Avoid_: Loop Tuner, Settings, AI recommendation

**Hypo Investigation Module**:
A focused investigation of hypoglycaemic events, their timing, context, possible drivers, and supporting charts. It is available directly from the Hub and through contextual links from Trends and alerts.
_Avoid_: AI Hypo Detective, Alert Occurrence

**Deep Screen**:
A destination that requires specific context such as an event, meal, activity, settings change, historical match, or AI conversation. It is opened from its owning Module and does not appear as an independent Module Tile.
_Avoid_: Module

**Contextual Entry**:
A link that opens the canonical owning Module or Deep Screen with the relevant Workspace, entity, time range, and filters already selected. Back returns to the originating view, while Recents records only the owning Module.
_Avoid_: Duplicate screen, Saved view

**Personalisation Questionnaire**:
The initial, skippable three-stage questionnaire that asks about the Product User's relationship to the Data Subject, what they want to find quickly, and their preferred start destination, Current Snapshot, and shortcuts. Relationship is stored per Workspace, goals and favorites at account level, and shell presentation in each Layout Profile. It preselects an editable starting layout: Self suggests Day Graph, Daily Overview, and Trends; Parent or Caregiver suggests Day Graph, Hypo Investigation, Update Center, and Current Snapshot; Clinician suggests Daily Overview, Trends, Loop Changes and Impact, and Similar Events. Explicit selections always override the suggestion, and no preset restricts product capabilities.
_Avoid_: Access questionnaire, Mandatory role selection

**Recent Module**:
A Module destination recorded automatically after a visit. It does not preserve transient screen state, drafts, raw data, or conversation content.
_Avoid_: Navigation history, Saved view

**Favorite Destination**:
A Module or stable destination inside a Module explicitly pinned by a Product User for quick access, such as Trends or Trends / AGP. It never captures transient filters or medical payloads. There is no hard product limit on Favorite Destinations. The Hub initially shows a responsive compact block and reveals the full ordered set on request rather than discarding selections.
_Avoid_: Saved view

**Account Preference**:
A Product User preference that follows the account across devices, such as Favorite Destinations, Module visibility, and general behaviour.
_Avoid_: Screen state, Layout Profile

**Layout Profile**:
The synchronised presentation preferences for one form factor: Phone, Tablet, or Desktop. It allows one account to use different arrangements on different classes of device.
_Avoid_: Account Preference, Device session

**AI Analyst**:
The advisory assistant whose primary surface is a simple general Chat at the top of an internal Hub. Focused categories and AI Specialists appear below it rather than as peer actions competing with Chat. The AI Analyst can analyse Nightscout data, remember relevant user context, and suggest actions, but it does not directly change therapy settings or Nightscout data.
_Avoid_: Autonomous treatment agent

**AI Specialist**:
A focused AI workflow with task-specific instructions and tools, opened from the AI Analyst's secondary categories or a contextual entry. V1 has a curated registry for Hypo Investigation, Behaviour Analysis, Loop Advice, and Meal Analysis. The AI may recommend or reorder approved specialists but may not invent a new medical specialist at runtime. Each specialist uses a visibly labelled conversation separate from general Chat. General Chat may suggest a handoff and pass relevant context only after explicit confirmation. It is not a top-level Module.
_Avoid_: Module, Autonomous treatment agent

**Pre-Meal Assistance**:
An optional capability, disabled by default, that presents a contextual card in the Day Graph when relevant and may open Meals or the AI Analyst. It produces a notification only after separate user opt-in.
_Avoid_: Mandatory recommendation, Module

**Daily Score**:
An optional future, Workspace-scoped interpretation inside the Previous Day Summary. V1 does not carry forward the legacy formula or ship a replacement number. A future version requires a separately specified, tested, coverage-gated, and explained formula; its visibility preference then synchronises per Workspace. The underlying metrics and summary never depend on it.
_Avoid_: Clinical grade, Universal outcome

**AI Conversation**:
An AI Analyst conversation bound to exactly one Workspace. It must not continue against a different Workspace after the active Workspace changes.
_Avoid_: Account-wide chat

**Recommendation**:
An advisory suggestion produced from available evidence. ShaniDms never applies a Recommendation directly to therapy settings.
_Avoid_: Automatic adjustment, Prescription

**Alert Rule**:
A user-defined condition that determines when ShaniDms should raise an alert.
_Avoid_: Notification, Alert

**Alert Occurrence**:
An immutable record that an Alert Rule or built-in alert policy matched at a particular time.
_Avoid_: Alert Rule, Notification delivery

**Reminder**:
A time-based intention explicitly approved by a Product User.
_Avoid_: Alert Rule

**Notification Delivery**:
An attempt to present an Alert Occurrence, Reminder, or other update through a device channel.
_Avoid_: Alert Occurrence

**Update Center**:
The Module that presents recent Alert Occurrences, Reminders, and generated briefs. Alert Rule management is a separate destination.
_Avoid_: Notification settings
