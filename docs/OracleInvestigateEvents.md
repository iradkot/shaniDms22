# Investigate Events ("Oracle") — Product Review Doc

> Date: 2026-01-04

## TL;DR

- **Today (v1):** We do pattern matching on BG history to answer “what usually happens next?”.
- **Next (v2):** Add **Actionable Intelligence** by correlating **Treatments → Outcomes** to answer “what actions historically worked best in similar situations?”.
- **Safety:** The app must only describe historical associations (not prescribe). Always include a visible disclaimer.

## 1) What this feature is

The **Investigate Events** tab (previously labeled “Oracle”) is a pattern-matching tool:

- A user selects a **recent event** (an anchor point in recent BG data).
- The app searches **historical BG history** for **previous similar events**.
- It visualizes what typically happened **after** those similar events and provides a short text insight.

This is meant to answer:

- “When my BG looks like *this* at *this time of day*, what usually happens next?”


## 2) Current UX (in-app)

### 2.1 Entry point

- Bottom tab: **Oracle** (label can be renamed later; current implementation keeps the tab label).
- Screen title: **Investigate Events**.

### 2.2 Flow

1) **Pick an event**
   - Shows a small list of recent candidate events (spaced out to avoid duplicates).
   - Each row displays:
     - Event kind: `Rising` / `Falling` / `Stable`
     - Time (local time)
     - Slope (mg/dL/min)
     - BG value (mg/dL)

2) **Compare vs history**
   - The chart overlays:
     - The user’s **current** recent BG (up to 2h back)
     - Several matched historical trajectories (“ghost” traces)
     - A median trajectory (future window)

3) **Insight**
   - A concise text summary of what often happened in those matches.

4) **Previous events list**
   - A short list of recent historical matches.
   - Each item shows:
     - Anchor timestamp (local date/time)
     - Anchor BG value
     - Basic outcome summary (currently: 2h min + 4h max)


## 3) Definitions (important for product discussions)

### 3.1 “Event” (today)

An “event” is **not** a logged user action (meal/bolus/exercise).

Today it is purely a **BG pattern anchor**:

- A point in recent BG data with an estimated slope at that time.
- Categorized into an event kind:
  - `Rising` if slope > +0.5 mg/dL/min
  - `Falling` if slope < −0.5 mg/dL/min
  - `Stable` otherwise

### 3.2 “Previous events” (today)

These are matched historical anchors that:

- Occurred **before** the selected event timestamp
- Have similar:
  - Time-of-day window
  - BG level (within tolerance)
  - Trend bucket and slope proximity


## 4) Data inputs & storage

### 4.1 Live / recent BG

- Source: Nightscout via existing API requests.
- Recent window used for anchoring/slope: ~3 hours (derived around the current snapshot).

### 4.2 Historical BG cache

- A 90‑day local cache is synced and stored on device.
- This cache is used for matching even when live fetch fails.

### 4.3 Offline behavior

- If fetching recent BG window fails, the hook derives a best-effort recent window from cached history.
- If live snapshot is missing, the feature currently has limited ability to compute “recent event candidates”.


## 5) Matching logic (current implementation)

### 5.1 High-level

Given a selected anchor event with:

- Anchor time `T0`
- Anchor BG `BG0`
- Anchor slope `S0`
- Anchor trend bucket `K0`

Search historical cache for entries `Ti` such that:

- Ti < T0 (previous-only)
- Time-of-day similarity: within `±90 min` circularly (handles day wrap)
- Glucose proximity: within `max(15 mg/dL, 10% of BG0)`
- Trend alignment:
  - Same trend bucket
  - Slope difference within a tolerance

Then build a trace by interpolating history to generate a series of points:

- Past window: −120 min
- Future window: +240 min

A median series is computed for future minutes where data exists.

### 5.2 Insight text (current)

The text insight is currently a simple outcome comparison across matches:

- % of matches that dropped below 120 within 2 hours
- % of matches that rose to ~250 within 4 hours

The larger percentage “wins” and is rendered as the single insight sentence.


## 6) E2E coverage (Maestro)

This repo uses Maestro flows under `e2e/maestro/`.

### 6.1 Oracle Investigate Events

- Flow: `e2e/maestro/oracle-events.yaml`
- Validates:
  - Oracle tab opens
  - Event list renders
  - Selecting an event triggers insights + chart
  - “Previous events” list renders

### 6.2 Related E2E flows supporting stability

- `e2e/maestro/login-and-tabs.yaml` (baseline navigation)
- `e2e/maestro/charts-smoke.yaml` (chart containers)
- `e2e/maestro/home-header-smoke.yaml` + `glucose-log-loadbars.yaml`
- `e2e/maestro/nightscout-scan.yaml`
  - Ensures Home header is driven by live Nightscout data vs fallback in E2E mode.


## 7) Current limitations / open questions

### 7.1 Product meaning of “event”

Today “event” = “BG trend anchor”.

If Product expects event kinds like:

- Meal
- Bolus
- Exercise
- Hypo / Hyper episode
- Sensor/loop changes

…we need additional inputs (treatments, device status, user-entered logs) and explicit event definitions.

### 7.2 Explainability

We currently show:

- A graph + one-line insight
- A list of matched historical anchors

But we do not show *why* each match matched (time-of-day delta, BG delta, slope delta).

### 7.3 Personalization controls

No user controls exist yet for:

- Match strictness
- Time-of-day window size
- History window (30/60/90 days)
- Excluding nights/weekends, etc.

### 7.4 Stability vs data availability

If recent data is missing/empty, the event picker can become empty (nothing to investigate).


## 8) Extension ideas (concrete next steps)

Below are options Product can choose from; each is independent.

### 8.1 True “event kinds” (meal/bolus/exercise)

- Define event schemas:
  - Meal event: carbs, timestamp, optional photo
  - Bolus event: units, type
  - Exercise event: intensity + duration
  - Hypo/hyper: threshold-based episode
- Create an event timeline and let Investigate Events select from those, not from BG anchors.
- Matching would incorporate:
  - Event metadata (carbs, bolus, intensity)
  - Context window (BG and IOB/COB around the event)

### 8.2 Add an “Event details” drill-down

- Tapping a previous event could open a detail view:
  - Exact curve
  - Match reason breakdown
  - Outcome metrics

(Requires product decision: new screen vs inline expansion.)

### 8.3 Better outcome metrics

Replace or complement the current insight with:

- Probability of hypo (<70 / <80) in 2h/4h
- Time-to-peak / time-to-nadir
- Expected delta at +30/+60/+120 minutes
- Confidence (based on match count)

### 8.4 Reliability improvements

- Ensure recent event candidates always exist by:
  - Allowing anchors from cached history when live snapshot is missing
  - Or allowing the user to pick an anchor time from the Home chart

### 8.5 Experiment framework

- Add product toggles / remote config to A/B:
  - Strict vs loose matching
  - Different insight text variants


## 9) PRD v2.0 — Actionable Treatments ("So What?")

> **Goal:** Move from “predicting the curve” to “revealing the winning strategy.”
> **Key question:** “In similar past situations, what action (bolus/carbs) led to the best result?”

### 9.1 Core concept: Treatment clustering

Instead of averaging all matched historical trajectories into a single median, split matches into groups based on what the user actually did shortly after the event.

**Algorithm outline (v2):**

1) Find ~20 similar historical events using the existing match logic.
2) Look at **treatments** that occurred in the first **30 minutes** after each historical anchor.
3) Cluster matches into strategy buckets, for example:
   - **Cluster A (Passive):** no action
   - **Cluster B (Moderate):** correction ~1.0u–2.0u
   - **Cluster C (Aggressive):** correction > 3.0u
   (Exact thresholds are product-configurable.)
4) Compare outcomes (example metric): “BG at +2 hours” and “time in target (70–140)”.
5) Present 2–3 strategy cards: what happened historically in each cluster.

### 9.2 New data requirements

To correlate treatments with outcomes, the matching layer must stop operating on BG samples alone.

**Treatments endpoint**

- Endpoint: `/api/v1/treatments`
- Sync horizon: last 90 days (same as entries cache)
- Fields needed (minimum):
  - `eventType` (Correction / Meal)
  - `insulin`
  - `carbs`
  - `created_at`

**IOB context at the anchor**

- Problem: matching BG=200 with IOB=0u is not equivalent to BG=200 with IOB=5u.
- Fix: extend the anchor definition to include **IOB**.
- Matching filter: require historical IOB within ±1.0u of current IOB.

### 9.3 UI changes: Strategy cards (replace simple insight)

Replace the single text insight with 2–3 “What if?” strategy cards derived from historical clusters.

Each card should include:

- **Context:** how many similar events fell in this cluster
- **Action summary:** e.g. “no action”, “~1.5u–2.0u”, “>3u”, “carbs”
- **Outcome summary:** e.g. average BG at +2h, hypo risk, or time-in-range
- **Visual status:** best / neutral / warning

Example framing (safe wording):

- “In the past, a correction of **~2.5u** resulted in a stable range.”
- Avoid: “You should inject 2.5u.”

**Permanent disclaimer (required):**

> “Historical data analysis only. Not medical advice.”

### 9.4 Chart visualization: action markers

On historical ghost traces, render markers indicating treatment timing:

- **Blue dot:** insulin given
- **Orange dot:** carbs eaten

This helps users visually correlate “the lines that improved” with “the actions taken”.

### 9.5 Engineering implementation notes (proposed)

**Step A — Fetch & link treatments**

- Extend the oracle cache layer to fetch + store treatments alongside BG entries.
- Normalize all timestamps to ms and index treatments by time for fast range queries.
- For each historical match anchor, collect treatments in `[t0 .. t0+30m]`.

**Step B — Action analyzer**

Define an analyzer that converts matched events into strategy clusters and outcomes.

Suggested output shape (example):

```ts
interface ActionOutcome {
  actionType: 'None' | 'Correction' | 'Carbs';
  avgAmount: number; // e.g., 2.5 units or carbs
  resultBG: number; // BG value at +2h
  success: boolean; // based on configured target rules
  count: number;
}
```

Important: the UI should present these as “historical clusters” not prescriptions.

**Step C — Safety guardrails**

- Never present language that implies a directive dose.
- Always present results as historical associations.
- Consider showing uncertainty: match count, success rate, and a “low data” warning when matches are few.



## 10) Engineering notes / risks

### 9.1 Secrets & configuration

- Nightscout access currently uses a static `api-secret` header in the repo.
- Recommend moving secrets to build-time configuration (env/CI secrets) and avoiding committing secrets into source.

### 9.2 Performance

- Matching iterates over history entries and can be expensive at 90 days.
- There is a warning log when computation exceeds 1500ms.

Possible improvements:

- Pre-index history by time-of-day buckets
- Reduce candidate anchors by downsampling
- Cache computed features (slope, bucket) per entry

### 9.3 Determinism / testing

- Maestro is currently used for smoke-level UI verification.
- If we add richer event definitions, we should add:
  - Deterministic fixtures for treatments/events
  - Stable testIDs for event rows/details


## 11) Quick demo script (for PM review)

1) Open the app (E2E build if needed).
2) Go to **Oracle** tab.
3) In **Pick an event**, tap the top event.
4) Observe:
   - Graph overlays matched historical trajectories
   - Insight text changes
   - Previous events list shows historical anchors with outcomes


---

## Appendix A — Key files

- UI: `src/containers/MainTabsNavigator/Containers/Oracle/Oracle.tsx`
- Hook: `src/hooks/useOracleInsights.ts`
- Matching: `src/services/oracle/oracleMatching.ts`
- Cache: `src/services/oracle/oracleCache.ts`
- Types: `src/services/oracle/oracleTypes.ts`
- E2E IDs: `src/constants/E2E_TEST_IDS.ts`
- Maestro: `e2e/maestro/oracle-events.yaml`
