# Data access and calculations

Start with the existing module for the question being asked. Product components
render its result; platform adapters handle transport. Calculations must not
depend on React, authentication, storage or a running Android application.

## Choose the right entry point

| Need | Existing entry point | Meaning |
| --- | --- | --- |
| Current glucose, IOB and COB | `nativeCurrentDataSource` in `src/services/currentData` (native); `createBrowserCurrentDataSource` in `src/platform/web/nightscout` (browser) | Independent current reads, shared by the foreground current display and AI; historical coverage cannot invalidate a fresh current observation |
| Decode or load current facts with another transport | `buildCurrentDataSnapshot`, `createCurrentDataSource` in `src/modules/currentData` | Per-field source/fetch timestamps and fresh, stale or unavailable state; no profile, treatment or history dependency |
| Daily recorded insulin and same-time comparisons | `recordedInsulinDataSource` in `src/services/insulin/recordedInsulinDataSource.ts` (native) | Shared, source-scoped treatment snapshot; daily callers can opt into separately labeled profile estimates |
| Same recorded loader with a browser/test transport | `createRecordedInsulinDataSource` in `src/services/insulin/createRecordedInsulinDataSource.ts` | Inject transport, source identity and clock; no native runtime dependency |
| Calculate recorded insulin from already-loaded raw treatments | `buildRecordedInsulinSummary` in `src/services/insulin/recordedInsulin.ts` | Pure calculation; preserve raw delivery, identity and revision fields |
| Estimate uncovered daily basal | `buildEstimatedBasalUnits` in `src/services/insulin/estimatedBasal.ts` | Completed recorded amounts take precedence; schedule, temp basal and suspension controls fill only remaining time |
| Decode a raw treatment timestamp | `parseNightscoutTimestampMs` in `src/utils/nightscoutTimestamp.ts` | Shared epoch/ISO validation; invalid or ambiguous input returns `NaN` |
| A Daily Overview screen | `DailyOverviewDataSource` in `src/modules/dailyOverview` | Use the platform adapter supplied by the product host |
| Same-clock yesterday/week windows and comparison selection | `getDailyInsulinComparisonWindows`, `buildDailyInsulinComparison`, `selectRecordedInsulinComparison` in `src/modules/dailyOverview` | Local calendar dates; only compare a component supported in every required period |
| Glucose, treatment, device status ranges on native | `fetch*ForDateRangeWithMetadata` in `src/api/apiRequests.ts` | Complete bounded network read, source-scoped offline fallback, explicit freshness |
| Browser Nightscout reads | `BrowserNightscoutClient` and `createBrowserNightscoutDataSources` in `src/platform/web/nightscout` | Existing authenticated proxy; never import native Axios/storage into Web |
| Raw history for a module that owns its cache | `fetch*ForDateRangeUncached` in `src/api/apiRequests.ts` | Complete network read; glucose callers needing numeric facts must pass `{throwOnError: true}` |
| Chart treatment events, basal schedule and IOB/COB context | `loadInsulinContext` in `src/services/insulin/insulinDataSource.ts` | Normalized chart/context data with per-resource availability; not proof of delivered insulin |
| Recorded amounts when a chart/AI tool already loaded context | `context.recordedInsulin` | Same pure recorded calculator over the original raw snapshot, including carry-in; no extra request or normalized-event sum |
| Intentionally modeled insulin analysis | `calculateModeledInsulinContextMetrics` / `getModeledInsulinRangeMetrics` in `src/services/insulin/insulinRangeMetrics.ts` | Explicit schedule/treatment estimate; deprecated generic names remain only for compatibility |
| Long-range glucose analysis, AGP, descriptive statistics | `src/modules/trends` | Shared sample validation, thresholds and descriptive metrics |
| Daily elapsed-time CGM coverage and TIR | `buildElapsedGlucoseSummary` in `src/modules/trends` | Duration-weighted readings with cadence cap and no gap fill; general Trends stays sample-based |
| Forecasts | `createGlucoseForecastLoader` in `src/modules/glucoseForecast` | Existing forecast source and quality rules; do not extrapolate inside a component |
| Android launcher background summary | `WidgetDailySummary.kt` and `GlucoseWidgetInsulinData.kt` | Native adapter is required while JavaScript is suspended; shared fixtures define parity |

## Recorded insulin is different from a schedule model

**Recorded** means dose evidence supplied by Nightscout, not independent pump
verification. Bolus uses `deliveredUnits` when present, otherwise the source's
`insulin` amount (including manually recorded boluses). Basal accepts
`deliveredUnits`, or Loop's uploaded `amount`. A rate multiplied by
duration, a basal profile, or elapsed wall-clock time is not delivery evidence.
Loop does not necessarily upload every scheduled basal interval. Missing records
therefore do not mean zero insulin.

The older schedule/treatment model remains useful for charts and some legacy
analysis. `calculateTotalInsulin`, `buildBasalDeliveryTimeline`, and the context
metrics path can fill time from a profile. Their output must be called a model or
estimate, never used to populate recorded daily/widget totals. IOB is insulin
still active according to the source model; it is not today's administered dose.

Daily Overview, Personal Home and the Android summary widget may show a separate
`estimatedBasalUnits` / `estimatedTotalUnits`. This uses the raw recorded-dose
rules first, then fills uncovered time with the effective basal schedule and
temporary controls. A temp basal replaces scheduled delivery over its interval;
it is not added on top. The estimate never overwrites recorded basal, coverage
or quality. The primary basal/bolus amounts use the same basis as the displayed
total, with recorded subtotals still visible separately.

Use the returned quality state instead of inventing defaults:

| State | What can be shown |
| --- | --- |
| `available` | Known bolus plus explicit basal amounts covering the whole requested interval; total and ratio may be shown |
| `partial` | Known components and basal time coverage; a known basal-plus-bolus sum is labeled a recorded subtotal; an explicit valid estimate is labeled estimated total |
| `unavailable` | No usable snapshot; show unavailable, not `0 U` |

`0 U` is a valid recorded amount. `undefined` means unknown. Do not write
`basalUnits ?? 0` to make a total. A basal subtotal from 80% of a day is not an
estimate for 100% of that day. Comparisons prefer complete recorded totals, then
complete or estimated totals with an estimate label when either side is modeled,
then known recorded basal-plus-bolus subtotals, then clearly labeled bolus only.
The seven-day average requires all seven periods for the selected basis. A mix of
complete and estimated daily totals remains an estimate, never a recorded total.

Estimates require a fresh complete treatment snapshot and a validated schedule
with a midnight entry, unique times and consistent textual/numeric times. Profile
timezone controls schedule integration; absent timezone uses the device clock.
Native daily profile reads check through
the cutoff (through the full date for reusable past-day profiles) and accept a
schedule only if it was effective before the window. Unresolved profile changes
disable estimates. The browser proxy currently returns the latest profile, so Web
estimates additionally require its explicit effective date to precede the window.
Missing or stale profiles preserve recorded amounts without creating an estimate.

Both native and browser Previous Day Summary use the recorded loader. That older
screen's contract accepts only complete totals, so partial insulin is unavailable
there. The unused browser modeled-summary export is retained for compatibility;
it is not an alternative daily loader. Legacy Trends cards explicitly label their
profile-based TDD and basal/bolus ratio as estimates.

Completed interval doses crossing a boundary are allocated in proportion to the
recorded interval overlap. This assumes uniform delivery within that interval;
the data does not establish the time of each pump pulse. Instant doses belong to
their start timestamp. Mutable, invalid, conflicting or unfinished evidence is
not silently converted into known delivery.

## Current observations are independent of historical coverage

Native current data reads the latest count-bounded entries and device status
endpoints. The browser uses its authenticated proxy with an independent short
current window. Do not derive current glucose from a daily/weekly/monthly history
request: a history index, incomplete range, or failure can hide a valid latest
reading. The current loader reads glucose and device status independently, so a
failure in one resource does not erase successful observations from the other.

Historical native glucose queries now use numeric `find[date]` boundaries too.
The optional `dateString` field is not required to retrieve an otherwise valid
numeric-date entry. The retained `BGDataService` compatibility class delegates
to the canonical reader instead of maintaining an unscoped permanent cache.
This matches Nightscout's numeric date parsing and ordering in its
[entries source](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/server/entries.js)
and [query implementation](https://github.com/nightscout/cgm-remote-monitor/blob/master/lib/server/query.js).

Each of glucose, IOB and COB carries its own `sourceTimestampMs`, `fetchedAtMs`,
`ageMs`, `status`, and failure/staleness reason. The source timestamp establishes
the age. A recent upload or fetch does not make an old nested IOB/COB value fresh.
IOB is allowed to be signed, and confirmed zero COB remains zero. Missing,
invalid, future-dated or stale load values must not be converted to zero.

Current observations require an age below 15 minutes. Cached-after-failure
responses remain stale even if their sample is recent. After waiting for other
evidence, use `reobserveCurrentData(snapshot, nowMs)` to age the original snapshot;
do not reset its timestamps. AI evidence has separate current and historical
sections. A sparse historical period does not imply that current glucose is
missing. Historical recorded insulin is never substituted for current IOB.
Recommendation evidence also carries the earliest expiry of any fresh current
fact. The runtime checks it around model calls and before publishing; if a fact
ages out while the model is working, it asks for a fresh retry and does not
publish an answer grounded in an expired current observation.

The loader shares concurrent reads, without retaining a completed-value cache.
Native source identity includes the configuration revision, so switching away
and back cannot release an old in-flight result. Consumers must also reject a
changed source after slower historical work and before/after model calls.
The Android launcher widget retains its native background transport because
JavaScript may be suspended; its parsing/freshness rules require parity checks.
`current-load-parity.json` is consumed by TypeScript and Kotlin tests. Foreground
widget writes carry each load's original clock and the captured source revision;
both JavaScript and the native bridge reject obsolete source updates. Returning
from background to the foreground refreshes immediately, including when interval
polling is disabled. There is no new durable foreground cache: a cold offline
start can still have less data than the launcher's independently saved snapshot.

The regression `nativeCurrentAiEvidence.integration.test.tsx` exercises actual
native adapters and synthetic HTTP: latest numeric-date glucose is four minutes
old while a deliberately stale historical response contains only a 243-minute-old reading.
It also checks independent read failures and source changes during historical
loading. This reproduces the reported failure shape; it does not establish which
server response or installed build caused a particular patient's incident.

## Time, units and freshness

- Domain timestamps are Unix **milliseconds**. Domain windows are `[startMs,
  endMs)`: inclusive start, exclusive end. Nightscout v1 `$lte` queries are
  inclusive; adapters request `endMs - 1` where the domain window is exclusive.
- Glucose is `mg/dL`, insulin is `U`, rates are `U/hour`. Nightscout treatment
  `duration` is **minutes**. Never add rates as if they were delivered units.
- Capture one `asOfMs` for a refresh. Today is local midnight through that cutoff.
  Previous days end at the same local clock time. Use the calendar helpers;
  subtracting `24 * 60 * 60 * 1000` is wrong at daylight-saving transitions.
- A successful complete HTTP response proves the server's returned range was
  read. It does not prove every pump event reached Nightscout. Basal time coverage
  is a separate measurement from HTTP completeness and CGM coverage.
- `freshness.kind === 'stale'` is cached history after a network failure.
  Display it only with an explicit stale state; it cannot establish a current
  recorded-insulin total or a known-empty day.
- `TrendsDataSource.loadGlucoseSnapshot` preserves glucose samples and their
  original freshness/fetch time. Daily Overview displays cached/unknown freshness
  explicitly. The older array-only `loadGlucoseSamples` interface loses that
  metadata; use the snapshot method for new views that need freshness.
- Account/source identity and configuration revision scope every shared snapshot.
  A source switch during a request rejects the old result. Never reuse a loader
  cache under a constant identity across accounts.

## Native fetching without another paging implementation

For a screen or another native consumer, reuse the shared loader:

```ts
import {getLocalDayPeriod, selectRecordedInsulinComparison} from 'app/modules/dailyOverview';
import {recordedInsulinDataSource} from 'app/services/insulin/recordedInsulinDataSource';

const asOfMs = Date.now();
const period = getLocalDayPeriod(asOfMs);
const {current, comparison} = await recordedInsulinDataSource.loadDailyBundle(
  {period, asOfMs},
  {includeEstimates: true},
);
const versusYesterday = selectRecordedInsulinComparison(current, comparison.yesterday);
// Render current.quality and only present fields. The selector says whether
// its amounts mean recorded total, estimated total, subtotal or bolus.
```

The browser adapter injects `BrowserNightscoutClient.readRecordedTreatments` into
the same factory. This raw reader preserves delivery/revision/invalid fields;
`readTreatments` is the normalized reader for charts and context. The loader shares
one snapshot between the daily amount and comparisons. It does not import the
native singleton or start eight independent history reads.
Recorded-only consumers omit `includeEstimates`; they do not request a profile.
An advancing live estimate cutoff refreshes treatment observation rather than
modeling elapsed time beyond a cached snapshot.

```ts
import {fetchTreatmentsForDateRangeWithMetadata} from 'app/api/apiRequests';
import {buildRecordedInsulinSummary} from 'app/services/insulin/recordedInsulin';

// Prefer the shared recorded loader for screens. This lower-level example is
// for a module that already owns its raw snapshot and carry-in interval.
const snapshot = await fetchTreatmentsForDateRangeWithMetadata(
  new Date(carryInStartMs),
  new Date(period.endMs - 1),
);
const summary = snapshot.freshness.kind === 'fresh'
  ? buildRecordedInsulinSummary(snapshot.records, period, snapshot.freshness.fetchedAtMs)
  : {quality: 'unavailable' as const};
```

Do not normalize raw dose records through the chart mapper before calling the
recorded calculator: chart events intentionally omit delivery metadata. Do not
fetch a profile to make an incomplete recorded summary appear complete.

`requestCompleteNightscoutRange` owns v1 completeness: increase `count` until the
response is unsaturated, stop at the safety bound, reject a truncated range.
`skip` is not implemented by the relevant v1 list endpoints. Cached and uncached
glucose readers share the same complete transport and decoder.

## Adding or changing a calculation

1. Choose an entry point above. Add a pure rule to its owning module, not to the
   component, hook, AI tool or HTTP adapter.
2. Write a small raw-input regression case with a known expected amount, quality
   and interval. Keep fixtures synthetic and credentials out of test data.
3. For daily insulin, put cross-platform cases in
   `__tests__/fixtures/recorded-insulin.json`; both TypeScript and Kotlin consume it.
   Separate reconstruction cases use `__tests__/fixtures/estimated-basal.json`.
4. Test the caller seam too: completeness, account changes, stale data, source
   field preservation and cache reuse can invalidate a correct calculator.
5. Update this guide when introducing a genuinely different meaning or entry
   point. Prefer extending the existing module over another pass-through facade.

See [daily summary contract](DAILY_SUMMARY_DATA.md) for the shared fixtures and
Android checks. Use `yarn typecheck:rewrite`, `yarn typecheck:web`, and
`yarn test:all --silent` for the TypeScript consumers. Native insulin changes also
require `android/gradlew.bat -p android :app:testDebugUnitTest` on Windows.

## Limits of an accuracy claim

Fixture and transport tests verify how the program interprets supplied records.
They do not reconcile a particular user's totals with pump history. To investigate
a reported number, compare the exact installed version, source, local timezone,
cutoff, fetched timestamp, raw delivered-dose records and summary quality. A
screenshot alone cannot establish whether Nightscout is missing an event.

The September 2026 audit added regression cases for concrete failure patterns:

| Input | Previous failure | Required behavior |
| --- | --- | --- |
| One 2 U dose repeated with an empty `syncIdentifier` but matching `_id` | TypeScript counted 4 U while Android counted 2 U | Fall back to the next valid identity; count 2 U |
| 2 U `normal` bolus spanning 23:55–00:05 | Today's share was 0 U, unlike an equivalent interval bolus | Allocate 1 U to each five-minute overlap; state the allocation assumption |
| Loop basal with only rate and duration | Could be labeled recorded insulin | No delivered amount, so basal stays unknown |
| A cached dose whose end time passes after fetch | Became completed without another source observation | Keep the snapshot's original observation time |
| A multi-day request through the recorded loader | Only the first calendar day's records were fetched | Fetch the entire requested interval, plus required carry-in |
| Uneven CGM cadence: 100 at 00:00, 200 at 00:01, cutoff 00:10 | App showed 50% TIR/100% coverage; widget 17%/60% | Both use 1 in-range minute out of 6 observed minutes; 60% coverage |
| An uncached glucose response at the server count limit | Analysis could read only a prefix | Use the same bounded completeness reader as cached views |
