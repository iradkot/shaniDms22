# Investigate Events ("Oracle") — Implementation Deep Dive

> Date: 2026-01-07

This document describes **how the Oracle / Investigate Events feature works today in code**, including:

- What we fetch (Nightscout endpoints), what we cache locally, and how incremental syncing works
- How “events” are built and selected
- How the **matching algorithm** filters history and produces match traces
- How outcomes/strategies are computed
- The exact UI copy/text we show the user
- Which inputs/fields are supported by the codebase but **not currently used in the UX**

## 1) Where the code lives

Core data + math:

- `src/services/oracle/oracleConstants.ts`
- `src/services/oracle/oracleTypes.ts`
- `src/services/oracle/oracleCache.ts`
- `src/services/oracle/oracleMatching.ts`
- `src/services/oracle/oracleCgmGraphAdapter.ts` (adapter for richer match details UI)

Hook and UI:

- `src/hooks/useOracleInsights.ts`
- `src/containers/MainTabsNavigator/Containers/Oracle/Oracle.tsx`
- `src/containers/MainTabsNavigator/Containers/Oracle/components/OracleCards.tsx`
- `src/containers/MainTabsNavigator/Containers/Oracle/components/OracleRows.tsx`
- `src/containers/MainTabsNavigator/Containers/Oracle/components/OracleMatchDetailsCard.tsx`
- `src/containers/MainTabsNavigator/Containers/Oracle/utils/oracleUiUtils.ts`
- `src/components/charts/OracleGhostGraph/OracleGhostGraph.tsx`

Nightscout fetch utilities used by Oracle:

- `src/api/apiRequests.ts`
- `src/utils/mergeDeviceStatusIntoBgSamples.utils.ts` (device status timestamp + IOB/COB extraction helpers)

Tests:

- `__tests__/oracleCgmGraphAdapter.test.ts`
- `e2e/maestro/oracle-events.yaml`

## 2) User-facing UX (current)

### 2.1 Entry point

- Bottom tab label (in tab bar): **"Oracle"**
- Screen header/title inside the screen: **"Investigate Events"**

### 2.2 Screen sections + exact displayed copy

The Oracle screen is one scroll view containing these cards:

#### A) Header / status card

Title:

- **"Investigate Events"**

Dynamic subtitle line (event label):

- `"Rising event • {date/time}"` / `"Falling event • {date/time}"` / `"Stable event • {date/time}"`

Summary line (header summary):

- When no selected event yet: **"Waiting for recent data…"**
- When event selected but insights not computed yet: **"Searching cached history…"**
- When syncing and matchCount==0: **"Searching cached history…"**
- Otherwise: **"Found {matchCount} previous similar events."**

IOB/COB line (load summary):

- When no selected event: **"IOB — • COB —"**
- When insights missing: **"Calculating IOB/COB…"**
- When ready: **"IOB {x.y}u • COB {z}g"** (formats: `u` with 1 decimal, `g` rounded)

Matching mode hint:

- If “Include load” toggle is ON: **"Matching includes IOB/COB (when available)."**
- If OFF: **"Matching uses CGM pattern only."**

Load availability hint (only when toggle ON and the anchor has no numeric IOB/COB):

- **"IOB/COB not available for this event; matching will ignore load."**

Toggle label:

- **"Include IOB/COB in similar-event search"**

Slope smoothing control:

- Label: **"Slope points (noise smoothing)"**
- Buttons: **"−"** and **"+"**
- Hint text: **"Uses least-squares slope over the last 15 minutes."**
- Notes:
  - Higher values smooth CGM noise more, but can lag quick changes.
  - The value is clamped to `ORACLE_SLOPE_POINTS_MIN..MAX`.

Cache timestamp line (only when available):

- **"Cache updated: {date/time}"**

Sync hint when we are doing the initial (no-history) sync:

- `"{status.message} Similar events may be empty for a moment."`

Status banner (error state):

- Message (computed by the hook):
  - **"Unable to load data. Check your connection and try again."**
  - or **"Not enough recent data to pick an event yet. Try again in a minute."**
- Button label: **"Retry"**

Status banner (warn state when there is an error but we still show cached data):

- **"Live fetch unavailable; showing cached data when possible."**
- Button label: **"Retry"**

Status banner (info state while syncing with existing history):

- Message (computed): one of
  - **"Updating history cache…"**
  - **"Building your 90‑day history cache…"**
  - **"Syncing history cache…"**

Loading spinner caption (only when hook status.state == loading):

- **"Loading recent data…"**

#### B) “Pick an event” card

Title:

- **"Pick an event"**

Subtitle:

- **"Choose a recent point to compare against history."**

If no events available:

- **"No recent events yet."**

Each event row shows (single line format):

- Left title: `Rising` / `Falling` / `Stable`
- Meta line format:
  - `"{time} • slope {slope} mg/dL/min • IOB {iob} • COB {cob}"`
- Right value: `{sgv}` (raw BG number)

#### C) Ghost chart

Renders `OracleGhostGraph` (see section 6 for details).

#### D) “What tended to work” card

Title:

- **"What tended to work"**

Subtitle:

- **"Strategy cards group similar past events by actions recorded in the first 30 minutes. Historical associations only — not dosing advice."**

Strategy card badge:

- If marked best: **"Best historical outcome"**
- Otherwise: **"{count} matches"**

Outcome line formats:

- Avg line:
  - **"Avg +2h BG {value}"** or **"Avg +2h BG unavailable"**
- Success line:
  - **"{pct}% in 70–140 at +2h"** or **"Success rate unavailable"**

Empty state:

- **"No strategies yet (not enough similar events)."**

Disclaimer (comes from `ORACLE_DISCLAIMER_TEXT`):

- **"Informational only. Not medical advice. Always follow your clinician’s guidance and your therapy settings."**

#### E) “Previous events” card

Title:

- **"Previous events"**

Subtitle:

- **"Most recent similar events from history."**

If syncing and no matches shown yet:

- **"Searching history…"**

If no matches found:

- **"No similar events found."**

Each previous-event row meta line is composed as:

- Either `"2h min {min} • 4h max {max}"` OR `"Outcome unavailable"`
- Then `"IOB {iob} • COB {cob}"`
- Then `"TIR(0–2h) {percent}"`
- Then either **"Within next 2h"** or **"Outside next 2h"**

If a previous event row is tapped, an inline details card is rendered:

- Title: **"Event details"**
- One-line treatment summary:
  - **"Boluses (0–30m): {n} • Insulin: {x.y}U • Carbs: {z}g"**
- One-line load summary:
  - **"IOB/COB at event: {x.y}U / {z}g"**

## 3) Inputs, fetches, and local cache

Oracle uses two “data horizons”:

1) A **recent window** (~3 hours) to build event candidates and compute the “current” line.
2) A **90-day local cache** to match against and compute strategies/medians.

### 3.1 Live snapshot

`useOracleInsights` uses `useLatestNightscoutSnapshot({pollingEnabled: true})`.

- If snapshot BG is valid, it becomes the “now anchor”.
- If snapshot BG is missing (offline), it falls back to the last cached history entry.

### 3.2 Nightscout endpoints used

All are GETs via `nightscoutInstance`.

BG entries (cached by Oracle):

- `/api/v1/entries?find[dateString][$gte]={startISO}&find[dateString][$lte]={endISO}&count={count}`

Treatments (cached by Oracle):

- `/api/v1/treatments?find[created_at][$gte]={startISO}&find[created_at][$lte]={endISO}&count={count}`

Device status (cached by Oracle):

- `/api/v1/devicestatus?find[created_at][$gte]={startISO}&find[created_at][$lte]={endISO}&count={count}`

Important behavior:

- Oracle intentionally uses the “Uncached” variants in `apiRequests.ts` to avoid polluting generic date-range caches.
- Failures for these endpoints generally return `[]` (Oracle treats deviceStatus/treatments as optional).

### 3.3 Oracle local cache (AsyncStorage)

Oracle stores stable keys independent of rolling-window timestamps:

- BG entries: `oracle.entries.v2`
- Treatments: `oracle.treatments.v1`
- Device status: `oracle.deviceStatus.v1`
- Meta: `oracle.meta.v2`

Meta schema:

- `{ version: 2, lastSyncedMs: number }`

### 3.4 Cache sync behavior (full vs incremental)

Function: `syncOracleCache({ nowMs?, days? })`

Defaults:

- `days = 90` (also exposed as `ORACLE_CACHE_DAYS`)
- `nowMs = Date.now()`

Computed:

- `startMs = nowMs - days * 24h`

Full sync triggers when:

- There is no usable meta (`lastSyncedMs` missing/invalid), or
- There are 0 cached BG entries

Fetch range:

- Full sync: `[startMs, nowMs]`
- Incremental: `[max(startMs, lastSyncedMs - 5 minutes), nowMs]`

This “-5 minutes” overlap is intentional to reduce edge misses.

### 3.5 What we cache (shapes)

BG entries are slimmed to:

- `{ date: number(ms), sgv: number }`

Treatments are slimmed to:

- `{ ts: number(ms), insulin?: number, carbs?: number, eventType?: string }`

Timestamp parsing supports (in this order):

- `t.mills` (number)
- `t.created_at` (ISO string)
- `t.timestamp` (ISO string)

Device status is slimmed to:

- `{ ts: number(ms), iob?, iobBolus?, iobBasal?, cob? }`

Device status `ts` selection prefers Loop-aligned timestamps:

- `entry.loop.iob.timestamp`
- `entry.loop.cob.timestamp`
- `entry.loop.timestamp`
- fallback: `entry.mills`, then `entry.created_at`

Load extraction supports multiple payload shapes:

- Loop (`entry.loop.*`)
- OpenAPS (`entry.openaps.*`)
- top-level fallbacks (`entry.iob`, `entry.cob`)

## 4) Event candidates: how we pick “events”

An “event” here is a **recent BG anchor point**, not a user-logged event.

### 4.1 Recent window (currently used)

Constant:

- `ORACLE_RECENT_WINDOW_HOURS = 3`

The recent BG window is fetched as:

- `start = now.date - 3 hours`
- `end = now.date`

Offline fallback:

- If recent fetch fails, derive recent points from cached history in the same window.

### 4.2 How event rows are constructed

Function: `buildRecentEvents({ recentSlim, maxEvents, minSpacingMinutes })`

Current parameters (hard-coded in the hook):

- `maxEvents = 10`
- `minSpacingMinutes = 20`

Algorithm:

1) Walk the recent BG points from newest → oldest.
2) For each candidate time `t`, compute slope using least-squares regression (`slopeAtLeastSquares(recentSlim, t, { sampleCount: slopePointCount })`).
3) Keep the point if it is at least 20 minutes away from the last kept event.
4) Event kind is `trendBucket(slope)`.

If strict slope computation yields no events (e.g. sparse/gappy recent data):

- Fallback slope uses `bestEffortSlopeAt()` which:
  - looks backward up to 30 minutes
  - requires at least a 5-minute spacing between points
  - uses $(\Delta \text{SGV}) / (\Delta \text{minutes})$

Finally, events are enriched with best-effort IOB/COB via `findLoadAtTs()`.

## 5) Matching & calculation logic

The core computation is synchronous/pure:

- `computeOracleInsights({ anchor, recentBg, history, treatments, deviceStatus, includeLoadInMatching?, slopePointCount? })`

### 5.1 Constants / parameters (current values)

Caching:

- `ORACLE_CACHE_DAYS = 90`

Time and chart windows:

- `ORACLE_RECENT_WINDOW_HOURS = 3`
- `ORACLE_CHART_PAST_MIN = 120` (match traces include -2h)
- `ORACLE_CHART_FUTURE_MIN = 240` (match traces include +4h)

Slope (feature extraction):

- `ORACLE_SLOPE_WINDOW_MIN = 15`
- `ORACLE_SLOPE_POINTS_MIN = 2`
- `ORACLE_SLOPE_POINTS_MAX = 10`
- `ORACLE_SLOPE_POINTS_DEFAULT = 4`

Matching tolerances:

- `ORACLE_TIME_WINDOW_MIN = 90` (minutes-of-day circular window)
- `ORACLE_BG_TOLERANCE_FIXED = 15` (mg/dL)
- `ORACLE_BG_TOLERANCE_PERCENT = 0.1` (10%)
- `ORACLE_SLOPE_TOLERANCE = 2` (mg/dL/min)

Load matching:

- `ORACLE_LOAD_MAX_MATCH_DISTANCE_MIN = 10` (how close deviceStatus must be to be considered “at ts”)
- `ORACLE_IOB_TOLERANCE_U = 1.0`
- `ORACLE_COB_TOLERANCE_G = 20`

Treatments window:

- `ORACLE_ACTION_WINDOW_MIN = 30` (sum/count markers within first 30 minutes after match anchor)

Outcome metrics:

- `ORACLE_TARGET_BG_MIN_2H = 70`
- `ORACLE_TARGET_BG_MAX_2H = 140`
- `ORACLE_TARGET_BG_IDEAL_2H = 110`

Trend bucketing threshold (hard-coded):

- Rising if slope > `+0.5`
- Falling if slope < `-0.5`
- Else Stable

Interpolation gap guard (default parameter):

- `maxGapMin = 10` minutes (if nearest samples are farther than this, interpolation returns null)

### 5.2 “Slope at time” definition

We define slope at timestamp $T$ (mg/dL/min) over the prior 15 minutes using **least-squares linear regression** over $N$ sample points ("dots") across $[T-15\,\text{min}, T]$.

Implementation (`slopeAtLeastSquares()`):

- Choose $N$ evenly spaced timestamps across the window (inclusive).
- For each timestamp $t_i$, compute $\text{SGV}(t_i)$ via `interpolateSgvAt()`.
- Let $x_i$ be minutes relative to the anchor: $x_i = (t_i - T)$ (so $x_i \in [-15, 0]$), and $y_i = \text{SGV}(t_i)$.
- Compute slope as:

$$\text{slope}(T) = \frac{\sum_i (x_i-\bar{x})(y_i-\bar{y})}{\sum_i (x_i-\bar{x})^2}$$

Notes:

- Output is in **mg/dL/min**.
- If fewer than 2 SGV samples can be interpolated in the window, slope returns null.
- `slopeAt()` remains as a wrapper for backward compatibility and currently delegates to the regression slope.

Where `interpolateSgvAt()` behaves like:

- If there is a sample within 10 minutes of T, use it.
- Else, if there are samples on both sides within 10 minutes, linearly interpolate.
- Else return null.

### 5.3 Match filters (A/B/C/…)

Given an anchor BG sample:

- `nowTs = anchor.date`
- `nowSgv = anchor.sgv`

We compute:

- `currentSlope = slopeAt(recentWindowOrHistory, nowTs) ?? 0`
- `currentBucket = trendBucket(currentSlope)`
- `nowMinutes = minutesFromMidnightLocal(nowTs)`
- BG tolerance:
  - `bgTol = max(ORACLE_BG_TOLERANCE_FIXED, nowSgv * ORACLE_BG_TOLERANCE_PERCENT)`

We iterate each cached history entry `entry` with `t0 = entry.date` and apply:

1) **Previous-only:** `t0 < nowTs`
2) **Slope computable:** `pastSlope = slopeAt(history, t0)` must not be null
3) **Filter A — Time-of-day proximity:**
   - `circularMinuteDiff(nowMinutes, pastMinutes) <= ORACLE_TIME_WINDOW_MIN`
4) **Filter B — BG proximity:**
   - `abs(nowSgv - entry.sgv) <= bgTol`
5) **Filter C — Trend alignment:**
   - `trendBucket(pastSlope) == currentBucket`
   - `abs(currentSlope - pastSlope) <= ORACLE_SLOPE_TOLERANCE`
6) **Trace availability:** we must have at least some data out to +4h in the cache
7) **Optional Filter — Load proximity (when enabled):**
   - We compute best-effort anchor load and match load:
     - `anchorLoad = findLoadAtTs(deviceStatus, nowTs)`
     - `matchLoad = findLoadAtTs(deviceStatus, t0)`
   - If both anchor and match have numeric IOB, require `abs(anchorIob - matchIob) <= 1.0`
   - If both have numeric COB, require `abs(anchorCob - matchCob) <= 20g`
   - If either side is missing a numeric value, that specific check is skipped.

### 5.4 Trace construction

For each surviving match anchor `t0`, we build a minute-resolution trace for:

- $tMin \in [-120, +240]$ (inclusive)

For each minute, compute:

- `ts = t0 + tMin * 60s`
- `sgv = interpolateSgvAt(history, ts)`

Only minutes where `sgv != null` are included.

We also require a minimum amount of future data:

- At least 10 points with `tMin > 0` must exist.

### 5.5 Treatments summary and chart markers

For each match we look at treatments in `[t0, t0 + 30 minutes]`:

- Sum insulin for treatments where `insulin > 0`
- Sum carbs for treatments where `carbs > 0`
- Count “boluses” (insulin events) and “carbs events” (carb entries)

We also create `actionMarkers` used by the ghost chart:

- For each relevant treatment event, we add `{ tMin, kind: 'insulin' | 'carbs' }`.

### 5.6 TIR(0–2h) per match

We compute per-match time-in-range ratio over trace points with `tMin in [0..120]`:

- In-range is `70 <= sgv <= 140`
- `tir2h = inRangeCount / windowCount`

This is rendered as `TIR(0–2h) {percent}` in the Previous Events list.

### 5.7 Output ordering and limiting

- All matches are sorted most-recent-first by `anchorTs`.
- The UI displays the first 10 matches.

## 6) “What tended to work” strategy cards

Strategies are built by grouping matches based on the *summarized 30-minute actions*.

### 6.1 Grouping rules (current)

`summarizeActions({ insulin, carbs })` returns a bucket:

- If insulin > 0:
  - `< 1u` → key `insulin.tiny`, title **"Small insulin (recorded)"**
  - `1–2u` → key `insulin.small`, title **"Moderate insulin (recorded)"**
  - `> 3u` → key `insulin.large`, title **"Higher insulin (recorded)"**
  - else → key `insulin.other`, title **"Insulin (recorded)"**
- Else if carbs > 0:
  - key `carbs`, title **"Carbs (recorded)"**
- Else:
  - key `none`, title **"No recorded carbs/insulin"**

Each group also contains an action summary string:

- Insulin groups: `"Total insulin recorded in first 30m: {x.y}u"`
- Carbs group: `"Total carbs recorded in first 30m: {z}g"`
- None group: `"No carbs/insulin recorded in first 30m"`

### 6.2 Outcome metrics per strategy

For each group:

- Collect `bg2h = sgv at minute 120` (best-effort nearest within 10 minutes).
- `avgBg2h` is the mean of `bg2h` (rounded to integer in the final card).
- `successRate` is fraction of `bg2h` values within 70–140, rounded to 2 decimals.

Cards are:

- Sorted by descending `count`.
- Only the top 3 are returned.

“Best historical outcome” is chosen among those 3 by:

- Highest successRate
- Tiebreaker: closeness to ideal 110 at +2h

## 7) Ghost chart rendering details

Component: `OracleGhostGraph`

X-axis domain is fixed:

- -120 to +240 minutes

X tick labels include:

- `"Now"` at 0
- `"1h"` for -60, `"2h"` for -120, and `"+1h"`, `"+2h"`, etc for future.

Y-axis domain is computed from available series (current/matches/median) with padding:

- Baseline is at least `[40, 250]`
- If data extends beyond, we pad to nearest 10 plus +/-20.

What’s drawn:

- Ghost match traces (thin, semi-transparent)
- Treatment markers (small circles):
  - Insulin marker color: `theme.colors.insulin`
  - Carbs marker color: `theme.colors.carbs`
- Median future path (dashed)
- Current path (thicker, accent color)

## 8) “Supported but not currently used” capabilities

This section is intentionally strict: these are things the **code already supports** or clearly scaffolds, but the current UX does not expose.

### 8.1 Rich match drill-down using `CgmGraph`

The adapter `oracleCgmGraphAdapter.ts` can convert a match to the richer chart inputs:

- `bgSamples` (as `BgSample[]`)
- `foodItems` (`FoodItemDTO[]`) with name `"Carbs"`
- `insulinData` (`InsulinDataEntry[]` with `type: 'bolus'`)
- window `[anchor-120m, anchor+240m]`

Today the UI uses only `OracleGhostGraph`. A future screen could reuse this adapter to show an interactive CGM graph with carb/bolus overlays.

### 8.2 Using treatment `eventType`

Treatments are cached with optional `eventType`, but the matching + UI currently uses only numeric `insulin` and `carbs`.

Potential uses (not implemented):

- Differentiate manual bolus vs SMB vs correction vs meal bolus
- Separate “meal carbs” vs “treatment carbs”

### 8.3 Using split IOB (bolus vs basal)

Device status cache stores:

- `iob` (total)
- `iobBolus`
- `iobBasal`

Matching currently uses only `iob` and `cob` and ignores split IOB.

Potential uses (not implemented):

- Require similar *bolus IOB* rather than total IOB
- Expose “IOB composition” in UI to explain differences

### 8.4 Explainability (“why did this match?”)

The algorithm computes (implicitly):

- time-of-day delta (minutes)
- BG delta and computed BG tolerance
- slope delta and slope bucket
- optional IOB/COB delta

None of these are rendered today. A future UI could show per-match “match reasons” for trust.

### 8.5 Personalization knobs

All tolerances are constants today. The code would support parameterizing:

- time-of-day window
- BG tolerance (fixed/percent)
- slope window + slope tolerance
- action window length
- cache history days

This would require product decisions + UI, not just code wiring.

## 9) Test coverage

E2E:

- `e2e/maestro/oracle-events.yaml` verifies:
  - opening Oracle screen
  - selecting an event
  - ghost chart renders
  - strategies section renders + disclaimer visible
  - previous events renders, and details card expands when possible

Unit test:

- `__tests__/oracleCgmGraphAdapter.test.ts` verifies conversion of matches to graph-ready data.
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
