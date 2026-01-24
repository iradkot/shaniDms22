# AI Analyst (LLM Integration) — PRD + Implementation Notes

> Date: 2026-01-24

This document specifies the **AI Analyst** feature for `shaniDms22`.

The goal is to add a new bottom tab that provides **LLM-powered insights** using the user’s own Nightscout data.

Key constraints for this repo:

- **No free LLM tokens**: the user must provide their own API key/token.
- **OpenAI first**, but the code must be **provider-agnostic** so we can add other LLMs later.
- Reuse existing Nightscout fetching, hypo investigation logic, UI patterns, and disclaimer standards.

---

## 0) High-level UX

### 0.1 Entry point

- New bottom tab label: **"AI Analyst"**
- Behavior when token is missing: **Visible but locked**.

Locked screen copy (exact):

- Title: **"AI Analyst"**
- Body: **"To use AI Analyst, add your own LLM API key in Settings. This feature sends your health data to the selected LLM provider."**
- Primary button: **"Open Settings"**

### 0.2 Main flow (when token exists)

Instead of a blank chat, the user starts by selecting a **Mission** (guided investigations).

Flow:

1. User enters AI Analyst tab.
2. User selects a mission card (e.g. Hypo Detective).
3. App performs local data preparation (progress UI).
4. App sends compact structured context + mission prompt to LLM.
5. The LLM returns a "Briefing".
6. User continues in chat to refine the analysis.

---

## 1) “No free tokens” requirement

### 1.1 Data model

We store user-provided LLM configuration in local storage.

- Storage: **AsyncStorage** (acceptable for now).
- Token/key name: `apiKey` (provider-specific).

### 1.2 Gating rules

- If `apiKey` is empty/missing: show locked screen.
- If `apiKey` is present but invalid: show an error with a "Fix in Settings" CTA.

### 1.3 Visibility toggle

- A Settings toggle controls whether the **AI Analyst tab** is visible.
- Default: **ON**.

---

## 2) Providers and architecture

### 2.1 Provider-agnostic design

Implement a thin interface for providers:

- `LLMProvider` interface: `sendChat(request) -> response`
- `OpenAIProvider` implementation (v1)
- Later: add more providers by implementing the same interface.

This keeps UI and context builders independent of OpenAI specifics.

### 2.2 Models

- Default: OpenAI chat model.
- The model name is **configurable in Settings** (string; no hard validation).

---

## 3) Safety + disclosure

This app is informational; do not position outputs as medical prescriptions.

### 3.1 Disclosure (required)

- Show a short disclosure text on the locked screen and on the mission screen:
  - **"AI Analyst sends your diabetes data (BG, treatments, device status) to an external LLM provider to generate insights."**

### 3.2 Disclaimer text

Reuse the app’s current disclaimer tone (see Oracle):

- **"Informational only. Not medical advice. Always follow your clinician’s guidance and your therapy settings."**

---

## 4) Missions (initial set)

### Mission A: Hypo Detective (MVP)

User intent:

- “Why do I keep going low?”
- “What patterns exist in my severe hypos?”

Data strategy (reuse existing logic):

- Use user-configured thresholds from `GlucoseSettingsContext`.
- Use Trends/Hypo Investigation logic to extract recent severe hypo events.
- Build a compact JSON list of events with context windows and treatment summaries.

Suggested defaults:

- Range: last **30–60 days**
- Max events sent to LLM: **10–15** (to control cost/latency)

Context for each event should include (best effort):

- Local time bucket (day-of-week + hour)
- nadir BG
- duration/time under threshold
- IOB/COB at nadir (if device status exists)
- bolus summary near event (e.g. last 1h)
- carbs summary near event (e.g. last 2h)
- temp basal / pump actions near event (if available)

LLM output requirements:

- Start with a short “What I found” summary.
- Provide 2–4 likely hypotheses, framed as “data suggests”.
- Provide “What to look at next” questions.

### Mission B: Morning Spikes (v2)

Analyze wake-up highs / dawn phenomenon patterns.

### Mission C: Loop Tuner (v2)

Lightweight analysis based on profile + post-meal outcomes.

### Mission D: Food Strategist (v2)

Search history for similar meal notes (if present), compare outcomes.

---

## 5) Context Builder (local processing)

The LLM is only as good as the **structured context** we send.

### 5.1 Principles

- Do heavy work locally; send only derived summaries.
- Reuse existing fetchers/utilities.
- Keep UI responsive; yield during long scans (pattern used by Oracle’s progressive compute).

### 5.2 Code reuse targets (existing repo)

Nightscout fetchers:

- `src/api/apiRequests.ts`

Hypo Investigation:

- `src/containers/MainTabsNavigator/Containers/Trends/HypoInvestigationScreen.tsx`
- `src/containers/MainTabsNavigator/Containers/Trends/utils/hypoInvestigation.utils`

Treatments mapping:

- `src/utils/nightscoutTreatments.utils.ts`

IOB/COB patterns:

- `src/hooks/useLatestNightscoutSnapshot.ts`
- `src/services/oracle/oracleMatching.ts` (device status nearest lookup)

---

## 6) UI requirements

### 6.1 Dashboard (Mission picker)

- Grid or list of mission cards (4 max for v1).
- Each card has:
  - Title
  - One-line subtitle
  - Icon

### 6.2 Mission screen

- Progress UI while building context:
  - Example: “Scanning last 30 days…” / “Finding severe lows…” / “Summarizing treatments…”
- Shows disclaimer/disclosure.
- Chat UI:
  - Message list
  - Input box
  - “Regenerate briefing” action (optional)

### 6.3 Markdown rendering

- Nice-to-have: markdown rendering for lists/bold.
- If we don’t add a markdown dependency in v1, render plain text with simple styling.

---

## 7) Technical decisions

### 7.1 Frontend vs backend

- For MVP: call provider directly from the app using user-provided key.
- Later: optionally add a proxy backend if needed.

### 7.2 Testing

- Unit tests for context builder output shape and edge cases.
- Add E2E testIDs consistent with `src/constants/E2E_TEST_IDS.ts`.

---

## 8) Implementation plan (concrete)

1. Add `AiSettingsContext` (AsyncStorage) to store provider + apiKey.
2. Add Settings UI section for entering API key + disclosure text.
3. Add AI Analyst tab with:
   - Locked screen (no key)
   - Dashboard screen (missions)
   - Mission screen (Hypo Detective v1)
4. Build `HypoDetectiveContextBuilder` that reuses hypo investigation utilities and Nightscout fetchers.
5. Add provider interface + `OpenAIProvider` implementation.
6. Wire chat + briefing to provider calls.
7. Add tests (context builder + provider request formatting stubs).
